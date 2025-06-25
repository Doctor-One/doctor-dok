import { NextResponse, type NextRequest } from 'next/server'
import {SignJWT, jwtVerify, type JWTPayload} from 'jose'

export async function middleware(request: NextRequest) {
    const authorizationHeader = request.headers.get('Authorization');
    const jwtToken = authorizationHeader?.replace('Bearer ', '');

    if (!jwtToken) {
        return NextResponse.json({ message: 'Unauthorized', status: 401 }, { status: 401 });
    } else {
        try {
            const decoded = await jwtVerify(jwtToken, new TextEncoder().encode(process.env.NEXT_PUBLIC_TOKEN_SECRET || 'Jeipho7ahchue4ahhohsoo3jahmui6Ap'));
            const checkDbHeader = request.headers.get('database-id-hash') === decoded.payload.databaseIdHash;

            if(!checkDbHeader) {
                return NextResponse.json({ message: 'Unauthorized', status: 401 }, { status: 401 });
            }

        } catch (error) {
            console.log(error);
            return NextResponse.json({ message: 'Unauthorized', status: 401 }, { status: 401 });
        }

    }

    return NextResponse.next();
}
 
export const config = {
  matcher: ['/((?!api/db|api/saas|_next/static|content|download|_next/image|img|onboarding|pdf.worker.mjs|manifest|favicon.ico|$).*)'],
}