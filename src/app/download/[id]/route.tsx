import ServerEncryptedAttachmentRepository from "@/data/server/server-encryptedattachment-repository";
import { EncryptionUtils } from "@/lib/crypto";
import { authorizeRequestContext, genericDELETE } from "@/lib/generic-api";
import { StorageService } from "@/lib/storage-service";
import { NextRequest } from "next/server";

export const dynamic = 'force-dynamic' // defaults to auto


export async function GET(request: NextRequest, { params }: { params: { id: string }}) {

    const requestContext = await authorizeRequestContext(request);
    const storageService = new StorageService(requestContext.databaseIdHash);
    const attachmentRepository = new ServerEncryptedAttachmentRepository(requestContext.databaseIdHash);

    // Fetch attachment metadata to get filename and mime type
    const attachment = await attachmentRepository.findOne({ storageKey: (params.id) });
    
    if (!attachment) {
        return new Response('Attachment not found', { status: 404 });
    }

    const headers = new Headers();
    
    // Set proper content type
    if (attachment.mimeType) {
        headers.append('Content-Type', attachment.mimeType);
    } else {
        headers.append('Content-Type', 'application/octet-stream');
    }
    
    
    let fileContent = await storageService.readAttachment(attachment.storageKey) // TODO: add streaming

    if(requestContext.masterKey) { // decrypt file if master key is available
        const keyEncryptionTools = new EncryptionUtils(requestContext.masterKey);
        fileContent = await keyEncryptionTools.decryptArrayBuffer(fileContent);

        // Set content disposition with filename
        const filename = await keyEncryptionTools.decrypt(attachment.displayName) || `attachment-${params.id}`;
        headers.append('Content-Disposition', `attachment; filename="${filename}"`);

    }

    return new Response(fileContent, { headers });
}