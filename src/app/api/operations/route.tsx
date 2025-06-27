import { operationDTOSchema } from "@/data/dto";
import ServerOperationsRepository from "@/data/server/server-operations-repository";
import { authorizeRequestContext } from "@/lib/generic-api";
import { getZedErrorMessage } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest, response: NextResponse) {
    const requestContext = await authorizeRequestContext(request, response);
    const repo = new ServerOperationsRepository(requestContext.databaseIdHash, 'operations', 'operations');
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const recordId = searchParams.get('recordId');
    const recordIds = searchParams.get('recordIds');
    const operationName = searchParams.get('operationName');
    const operationId = searchParams.get('operationId');
    let filter: any = {};
    if (id) filter.id = id;
    if (recordId) filter.recordId = recordId;
    if (operationName) filter.operationName = operationName;
    if (recordIds) filter.recordIds = recordIds.split(',').map(id => id.trim());
    if (operationId) filter.operationId = operationId;
    const data = await repo.findAll({ filter });
    return Response.json({
        message: 'Operations fetched!',
        data,
        status: 200
    }, { status: 200 });
}

export async function POST(request: NextRequest, response: NextResponse) {
    const requestContext = await authorizeRequestContext(request, response);
    const repo = new ServerOperationsRepository(requestContext.databaseIdHash, 'operations', 'operations');
    const body = await request.json();
    const validationResult = operationDTOSchema.safeParse(body);
    if (!validationResult.success) {
        return Response.json({
            message: getZedErrorMessage(validationResult.error),
            issues: validationResult.error.issues,
            status: 400
        });
    }
    const data = await repo.create(validationResult.data);
    return Response.json({
        message: 'Operation created!',
        data,
        status: 200
    }, { status: 200 });
}

export async function PUT(request: NextRequest, response: NextResponse) {
    const requestContext = await authorizeRequestContext(request, response);
    const repo = new ServerOperationsRepository(requestContext.databaseIdHash, 'operations', 'operations');
    const body = await request.json();
    const validationResult = operationDTOSchema.safeParse(body);
    if (!validationResult.success) {
        return Response.json({
            message: getZedErrorMessage(validationResult.error),
            issues: validationResult.error.issues,
            status: 400
        });
    }
    // Upsert by id, recordId, or operationId
    const { id, recordId, operationId } = validationResult.data;
    const query: any = {};
    if (id !== undefined) query.id = id;
    else if (recordId !== undefined) query.recordId = recordId;
    else if (operationId !== undefined) query.operationId = operationId;
    const data = await repo.upsert(query, validationResult.data);
    return Response.json({
        message: 'Operation updated!',
        data,
        status: 200
    }, { status: 200 });
}

export async function DELETE(request: NextRequest, response: NextResponse) {
    const requestContext = await authorizeRequestContext(request, response);
    const repo = new ServerOperationsRepository(requestContext.databaseIdHash, 'operations', 'operations');
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const recordId = searchParams.get('recordId');
    const operationId = searchParams.get('operationId');
    const query: any = {};
    if (id !== null) query.id = id;
    else if (recordId !== null) query.recordId = recordId;
    else if (operationId !== null) query.operationId = operationId;
    const success = await repo.delete(query);
    return Response.json({
        message: success ? 'Operation deleted!' : 'Operation not found!',
        status: success ? 200 : 404
    }, { status: success ? 200 : 404 });
} 