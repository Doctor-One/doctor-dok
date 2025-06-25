import ServerEncryptedAttachmentRepository from "@/data/server/server-encryptedattachment-repository";
import { EncryptionUtils } from "@/lib/crypto";
import { authorizeRequestContext, genericDELETE } from "@/lib/generic-api";
import { StorageService } from "@/lib/storage-service";
import { NextRequest } from "next/server";

export const dynamic = 'force-dynamic' // defaults to auto

export async function DELETE(request: NextRequest, { params }: { params: { id: string }} ) {
    const requestContext = await authorizeRequestContext(request);
    const storageService = new StorageService(requestContext.databaseIdHash);

    const recordLocator = params.id;
    if(!recordLocator){
        return Response.json({ message: "Invalid request, no id provided within request url", status: 400 }, {status: 400});
    } else { 
        const repo = new ServerEncryptedAttachmentRepository(requestContext.databaseIdHash)
        const recordBeforeDelete = await repo.findOne({ storageKey: recordLocator });
        if (!recordBeforeDelete) {
            return Response.json({ message: "Record not found", status: 404 }, {status: 404});
        }
        const apiResponse = await genericDELETE(request, repo, { storageKey: recordLocator});
        if(apiResponse.status === 200){
            storageService.deleteAttachment(recordLocator);
        }
        return Response.json(apiResponse);
    }
}

export async function GET(request: NextRequest, { params }: { params: { id: string }}) {
    const requestContext = await authorizeRequestContext(request);
    const storageService = new StorageService(requestContext.databaseIdHash);

    const headers = new Headers();
    headers.append('Content-Type', 'application/octet-stream');
    let fileContent = await storageService.readAttachment(params.id) // TODO: add streaming

    if(requestContext.masterKey) { // decrypt file if master key is available
        const keyEncryptionTools = new EncryptionUtils(requestContext.masterKey);
        fileContent = await keyEncryptionTools.decryptArrayBuffer(fileContent);
    }

    return new Response(fileContent, { headers });
}