import type { RequestHandler } from '@sveltejs/kit';
import { getImmichPreview, immichErrorResponse } from '$lib/server/immich';

export const GET: RequestHandler = async ({ params }) => {
	try {
		return await getImmichPreview(params.id);
	} catch (error) {
		return immichErrorResponse(error);
	}
};
