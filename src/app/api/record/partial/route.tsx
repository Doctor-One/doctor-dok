import { RecordDTO, recordDTOSchema } from "@/data/dto";
import ServerRecordRepository from "@/data/server/server-record-repository";
import { authorizeRequestContext } from "@/lib/generic-api";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest, response: NextResponse) {
    const requestContext = await authorizeRequestContext(request, response);
    const { searchParams } = new URL(request.url);
    
    const folderId = searchParams.get('folderId');
    const recordIds = searchParams.get('recordIds');
    const newerThan = searchParams.get('newerThan');
    const newerThanId = searchParams.get('newerThanId');
    
    if (!folderId) {
        return Response.json({ message: "folderId parameter is required", status: 400 }, { status: 400 });
    }
    
    try {
        const repo = new ServerRecordRepository(requestContext.databaseIdHash);
        const filter: any = { folderId: parseInt(folderId) };
        
        if (recordIds) {
            filter.recordIds = recordIds.split(',').map(id => parseInt(id.trim()));
        }
        
        if (newerThan) {
            filter.newerThan = newerThan;
        }

        if (newerThanId) {
            filter.newerThanId = newerThanId;
        }

        console.log('filter', filter);
        
        const records = await repo.findAll({ filter });
        return Response.json(records);
    } catch (error) {
        console.error('Error getting partial records:', error);
        return Response.json({ 
            message: "Error getting partial records", 
            status: 500 
        }, { status: 500 });
    }
} 