import type { RequestHandler } from '@sveltejs/kit';
import { getImmichAlbum, immichErrorResponse } from '$lib/server/immich';

export const GET: RequestHandler = async () => {
	try {
		return await getImmichAlbum();
	} catch (error) {
		return immichErrorResponse(error);
	}
};
