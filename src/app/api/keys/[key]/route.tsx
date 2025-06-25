import ServerConfigRepository from "@/data/server/server-config-repository";
import ServerKeyRepository from "@/data/server/server-key-repository";
import { authorizeRequestContext, genericDELETE } from "@/lib/generic-api";
import { NextRequest } from "next/server";

export async function DELETE(request: NextRequest, { params }: { params: { key: string }} ) {
    const requestContext = await authorizeRequestContext(request);
    if (requestContext.acl.role !== 'owner') {
        return Response.json({ message: "Owner role is required", status: 401 }, {status: 401});
    }

    const recordLocator = params.key;
    if(!recordLocator){
        return Response.json({ message: "Invalid request, no key provided within request url", status: 400 }, {status: 400});
    } else { 
        return Response.json(await genericDELETE(request, new ServerKeyRepository(requestContext.databaseIdHash), { keyLocatorHash: recordLocator}));
    }
}