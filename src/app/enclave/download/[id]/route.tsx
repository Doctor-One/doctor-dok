import ServerEncryptedAttachmentRepository from "@/data/server/server-encryptedattachment-repository";
import { EncryptionUtils } from "@/lib/crypto";
import { getErrorMessage } from "@/lib/utils";
import { AuthorizationError, AuthorizedRequestContext, authorizeRequestContext, genericDELETE} from "@/lib/generic-api";
import { StorageService } from "@/lib/storage-service";
import { NextRequest, NextResponse } from "next/server";
import { KeyAuthorizationZone } from "@/data/dto";

export const dynamic = 'force-dynamic' // defaults to auto


export async function GET(request: NextRequest, { params }: { params: { id: string } }, response: NextResponse) {

    let requestContext: AuthorizedRequestContext | null = null;

    try {
        requestContext = await authorizeRequestContext(request, response, KeyAuthorizationZone.Enclave);
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

        if (requestContext.masterKey) { // decrypt file if master key is available
            const keyEncryptionTools = new EncryptionUtils(requestContext.masterKey);
            fileContent = await keyEncryptionTools.decryptArrayBuffer(fileContent);

            // Set content disposition with filename
            const filename = await keyEncryptionTools.decrypt(attachment.displayName) || `attachment-${params.id}`;
            headers.append('Content-Disposition', `attachment; filename="${filename}"`);

        }

        return new Response(fileContent, { headers });

    } catch (error) {
        if (error instanceof AuthorizationError)
            return new Response(getErrorMessage(error), { status: 401 });
        else 
            return new Response(getErrorMessage(error), { status: 500 });
    } finally {
        if (requestContext) {
            requestContext.deleteTemporaryServerKey();
        }
    }
}