import { KeyACLDTO, KeyDTO, keyDTOSchema } from "@/data/dto";
import ServerConfigRepository from "@/data/server/server-config-repository";
import ServerKeyRepository from "@/data/server/server-key-repository";
import { authorizeRequestContext, genericGET, genericPUT } from "@/lib/generic-api";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(request: NextRequest, response: NextResponse) {
    const newKeyDataDTO = keyDTOSchema.parse(await request.json())
    try {
        const newKeyDataACL = newKeyDataDTO.acl ? JSON.parse(newKeyDataDTO.acl) as KeyACLDTO : null;
        const requestContext = await authorizeRequestContext(request, response);
        if (requestContext.acl.role !== 'owner' && (newKeyDataACL?.role !== 'temp' || !newKeyDataDTO.expiryDate)) { // if the key is not a temporary key and has no expiry date, it is not allowed to be created
            return Response.json({ message: "Owner role is required", status: 401 }, {status: 401});
        }

        const apiResult = await genericPUT<KeyDTO>(newKeyDataDTO, keyDTOSchema, new ServerKeyRepository(requestContext.databaseIdHash), 'keyLocatorHash');
        return Response.json(apiResult, { status: apiResult.status });
    } catch (error) {
        console.error(error);
        return Response.json({ message: "Invalid key data", status: 400 }, {status: 400});
    }
}

export async function GET(request: NextRequest, response: NextResponse) {
    const requestContext = await authorizeRequestContext(request, response);
    return Response.json(await genericGET<KeyDTO>(request, new ServerKeyRepository(requestContext.databaseIdHash)));
}
