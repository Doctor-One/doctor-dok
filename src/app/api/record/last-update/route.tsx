import ServerRecordRepository from "@/data/server/server-record-repository";
import { authorizeRequestContext } from "@/lib/generic-api";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest, response: NextResponse) {
    const requestContext = await authorizeRequestContext(request, response);
    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('folderId');
    
    if (!folderId) {
        return Response.json({ message: "folderId parameter is required", status: 400 }, { status: 400 });
    }
    
    try {
        const repo = new ServerRecordRepository(requestContext.databaseIdHash);
        const lastUpdateInfo = await repo.getLastUpdateDate(parseInt(folderId));
        
        return Response.json({
            message: "Last update info retrieved successfully",
            data: { 
                lastUpdateDate: lastUpdateInfo?.updatedAt || null,
                recordId: lastUpdateInfo?.recordId || null,
                recordCount: lastUpdateInfo?.recordCount || 0
            },
            status: 200
        });
    } catch (error) {
        console.error('Error getting last update info:', error);
        return Response.json({ 
            message: "Error getting last update info", 
            status: 500 
        }, { status: 500 });
    }
} 