import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALBUM_TTL = 30_000;
const REQUEST_TIMEOUT = 10_000;
const SEARCH_PAGE_SIZE = 250;
const MAX_SEARCH_PAGES = 100;
const CACHE_CONTROL = 'private, no-store';
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']);

type Album = { name: string; assets: { id: string; fileName: string }[] };
type Configuration = { apiUrl: string; apiKey: string; albumId: string };
type AlbumSnapshot = { album: Album; members: Set<string>; expiresAt: number };
type State = {
	key: string;
	configuration: Configuration;
	snapshot?: AlbumSnapshot;
	pending?: Promise<AlbumSnapshot>;
};

let state: State | undefined;

class ImmichError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
	}
}

function configurationState(): State {
	const url = env.IMMICH_URL?.trim();
	const apiKey = env.IMMICH_API_KEY?.trim();
	const albumId = env.IMMICH_ALBUM_ID?.trim().toLowerCase();
	const key = JSON.stringify([url, apiKey, albumId]);
	if (state?.key === key) return state;
	state = undefined;

	if (!url || !apiKey || !albumId) {
		throw new ImmichError(
			503,
			'Immich 未配置，请设置 IMMICH_URL、IMMICH_API_KEY 和 IMMICH_ALBUM_ID。'
		);
	}
	if (!UUID.test(albumId)) {
		throw new ImmichError(503, 'IMMICH_ALBUM_ID 配置无效，请填写相册的 UUID。');
	}
	if (/[\r\n]/.test(apiKey)) {
		throw new ImmichError(503, 'IMMICH_API_KEY 配置无效，请检查密钥。');
	}

	let apiUrl: URL;
	try {
		apiUrl = new URL(url);
	} catch {
		throw new ImmichError(503, 'IMMICH_URL 配置无效，请填写 HTTP 或 HTTPS 地址。');
	}
	if (
		!['http:', 'https:'].includes(apiUrl.protocol) ||
		apiUrl.username ||
		apiUrl.password ||
		apiUrl.search ||
		apiUrl.hash
	) {
		throw new ImmichError(
			503,
			'IMMICH_URL 仅支持不含账号、密码、查询参数和片段的 HTTP 或 HTTPS 地址。'
		);
	}
	const path = apiUrl.pathname.replace(/\/+$/, '');
	if (path !== '' && path !== '/api') {
		throw new ImmichError(503, 'IMMICH_URL 请填写 Immich 根地址或以 /api 结尾的地址。');
	}
	apiUrl.pathname = '/api/';
	state = { key, configuration: { apiUrl: apiUrl.href, apiKey, albumId } };
	return state;
}

async function request<T>(
	configuration: Configuration,
	path: string,
	read: (response: Response) => Promise<T>,
	options?: { method: 'POST'; body: Record<string, unknown> }
): Promise<T> {
	const signal = AbortSignal.timeout(REQUEST_TIMEOUT);
	try {
		const response = await fetch(new URL(path, configuration.apiUrl), {
			method: options?.method ?? 'GET',
			headers: {
				'x-api-key': configuration.apiKey,
				...(options ? { 'Content-Type': 'application/json' } : {})
			},
			body: options ? JSON.stringify(options.body) : undefined,
			redirect: 'error',
			cache: 'no-store',
			signal
		});
		if (!response.ok) {
			await response.body?.cancel();
			if (response.status === 401 || response.status === 403) {
				throw new ImmichError(
					502,
					'Immich 拒绝访问，请检查 API 密钥的 album.read、asset.read 和 asset.view 权限。'
				);
			}
			if (response.status === 404) {
				throw new ImmichError(404, 'Immich 相册或图片不存在，请检查相册配置或刷新相册。');
			}
			throw new ImmichError(502, 'Immich 服务暂时无法处理请求，请稍后重试。');
		}
		return await read(response);
	} catch (error) {
		if (error instanceof ImmichError) throw error;
		if (signal.aborted) {
			throw new ImmichError(504, 'Immich 请求超时，请检查家庭网络或稍后重试。');
		}
		throw new ImmichError(502, '无法读取 Immich 响应，请检查服务地址、网络连接及是否发生重定向。');
	}
}

async function loadAlbum(configuration: Configuration): Promise<AlbumSnapshot> {
	const data: unknown = await request(
		configuration,
		`albums/${configuration.albumId}`,
		(response) => response.json()
	);
	if (!data || typeof data !== 'object') {
		throw new ImmichError(502, 'Immich 相册响应格式无效，请检查服务版本。');
	}
	const album = data as Record<string, unknown>;
	if (typeof album.albumName !== 'string' || ('assets' in album && !Array.isArray(album.assets))) {
		throw new ImmichError(
			502,
			'Immich 相册响应缺少名称或资产列表格式无效，请检查 API 版本兼容性。'
		);
	}
	const values: unknown[] = Array.isArray(album.assets) ? album.assets : [];
	if (!('assets' in album)) {
		let page = 1;
		for (let count = 0; count < MAX_SEARCH_PAGES; count++) {
			const result: unknown = await request(
				configuration,
				'search/metadata',
				(response) => response.json(),
				{
					method: 'POST',
					body: {
						albumIds: [configuration.albumId],
						page,
						size: SEARCH_PAGE_SIZE,
						type: 'IMAGE',
						withDeleted: false
					}
				}
			);
			if (!result || typeof result !== 'object') {
				throw new ImmichError(502, 'Immich 搜索响应格式无效，请检查 API 版本兼容性。');
			}
			const searchAssets = (result as Record<string, unknown>).assets;
			if (!searchAssets || typeof searchAssets !== 'object') {
				throw new ImmichError(502, 'Immich 搜索响应缺少资产列表，请检查 API 版本兼容性。');
			}
			const { items, nextPage } = searchAssets as Record<string, unknown>;
			if (!Array.isArray(items)) {
				throw new ImmichError(502, 'Immich 搜索资产列表格式无效，请检查 API 版本兼容性。');
			}
			values.push(...items);
			if (nextPage === null) break;
			if (
				typeof nextPage !== 'string' ||
				!/^[1-9]\d*$/.test(nextPage) ||
				!Number.isSafeInteger(Number(nextPage)) ||
				Number(nextPage) <= page ||
				Number(nextPage) > MAX_SEARCH_PAGES ||
				count + 1 === MAX_SEARCH_PAGES
			) {
				throw new ImmichError(502, 'Immich 搜索分页无效或超过安全上限，请检查服务响应。');
			}
			page = Number(nextPage);
		}
	}
	const assets: Album['assets'] = [];
	for (const value of values) {
		if (!value || typeof value !== 'object') continue;
		const asset = value as Record<string, unknown>;
		if (
			asset.type === 'IMAGE' &&
			asset.isTrashed === false &&
			typeof asset.id === 'string' &&
			UUID.test(asset.id) &&
			typeof asset.originalFileName === 'string'
		) {
			assets.push({ id: asset.id.toLowerCase(), fileName: asset.originalFileName });
		}
	}
	return {
		album: { name: album.albumName, assets },
		members: new Set(assets.map((asset) => asset.id)),
		expiresAt: Date.now() + ALBUM_TTL
	};
}

async function albumSnapshot(current: State): Promise<AlbumSnapshot> {
	if (current.snapshot && current.snapshot.expiresAt > Date.now()) return current.snapshot;
	if (!current.pending) {
		current.snapshot = undefined;
		current.pending = loadAlbum(current.configuration);
	}
	try {
		const snapshot = await current.pending;
		if (configurationState() !== current) {
			throw new ImmichError(503, 'Immich 配置已变更，请重新请求。');
		}
		current.snapshot = snapshot;
		return snapshot;
	} finally {
		current.pending = undefined;
	}
}

export async function getImmichAlbum(): Promise<Response> {
	const snapshot = await albumSnapshot(configurationState());
	return json(snapshot.album, { headers: { 'Cache-Control': CACHE_CONTROL } });
}

export async function getImmichPreview(id: string | undefined): Promise<Response> {
	if (!id || !UUID.test(id)) {
		throw new ImmichError(400, '图片 ID 无效，请使用有效的资产 UUID。');
	}
	const current = configurationState();
	const snapshot = await albumSnapshot(current);
	const assetId = id.toLowerCase();
	if (!snapshot.members.has(assetId)) {
		throw new ImmichError(404, '图片不属于已配置相册，或已被移除、放入回收站。');
	}
	const image = await request(
		current.configuration,
		`assets/${assetId}/thumbnail?size=preview`,
		async (response) => {
			const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
			if (!mime || !IMAGE_TYPES.has(mime)) {
				await response.body?.cancel();
				throw new ImmichError(502, 'Immich 返回的预览内容不是受支持的图片格式。');
			}
			return { mime, body: await response.arrayBuffer() };
		}
	);
	if (configurationState() !== current) {
		throw new ImmichError(503, 'Immich 配置已变更，请重新请求。');
	}
	return new Response(image.body, {
		headers: {
			'Content-Type': image.mime,
			'Cache-Control': CACHE_CONTROL,
			'X-Content-Type-Options': 'nosniff'
		}
	});
}

export function immichErrorResponse(error: unknown): Response {
	return json(
		{ message: error instanceof ImmichError ? error.message : 'Immich 请求处理失败，请稍后重试。' },
		{
			status: error instanceof ImmichError ? error.status : 502,
			headers: { 'Cache-Control': CACHE_CONTROL }
		}
	);
}
