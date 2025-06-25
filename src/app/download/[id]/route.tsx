import ServerEncryptedAttachmentRepository from "@/data/server/server-encryptedattachment-repository";
import { EncryptionUtils } from "@/lib/crypto";
import { authorizeRequestContext, genericDELETE } from "@/lib/generic-api";
import { StorageService } from "@/lib/storage-service";
import { NextRequest } from "next/server";

export const dynamic = 'force-dynamic' // defaults to auto


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