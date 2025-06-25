import ServerRecordRepository from "@/data/server/server-record-repository";
import {  authorizeRequestContext, genericDELETE } from "@/lib/generic-api";
import { NextRequest } from "next/server";

export async function DELETE(request: NextRequest, { params }: { params: { id: number }} ) {
    const recordLocator = params.id;
    const requestContext = await authorizeRequestContext(request);

    if(!recordLocator){
        return Response.json({ message: "Invalid request, no id provided within request url", status: 400 }, {status: 400});
    } else { 
        return Response.json(await genericDELETE(request, new ServerRecordRepository(requestContext.databaseIdHash), { id: recordLocator}));
    }
}