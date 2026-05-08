<<<DEVFLOW_STACK_REF_START_cbc380843b4970ac>>>
TITLE: route.js
DESCRIPTION: TypeScript
SOURCE: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
LANGUAGE: text
CODE:
```text
export async function GET() {
  return Response.json({ message: 'Hello World' })
}
```

----------------------------------------

TITLE: HTTP Methods
DESCRIPTION: TypeScript
SOURCE: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
LANGUAGE: text
CODE:
```text
export async function GET(request: Request) {}
 
export async function HEAD(request: Request) {}
 
export async function POST(request: Request) {}
 
export async function PUT(request: Request) {}
 
export async function DELETE(request: Request) {}
 
export async function PATCH(request: Request) {}
 
// If `OPTIONS` is not defined, Next.js will automatically implement `OPTIONS` and set the appropriate Response `Allow` header depending on the other methods defined in the Route Handler.
export async function OPTIONS(request: Request) {}
```

----------------------------------------

TITLE: `request` (optional)
DESCRIPTION: TypeScript
SOURCE: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
LANGUAGE: text
CODE:
```text
import type { NextRequest } from 'next/server'
 
export async function GET(request: NextRequest) {
  const url = request.nextUrl
}
```

----------------------------------------

TITLE: `context` (optional)
DESCRIPTION: TypeScript
SOURCE: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
LANGUAGE: text
CODE:
```text
export async function GET(
  request: Request,
  { params }: { params: Promise<{ team: string }> }
) {
  const { team } = await params
}
```

----------------------------------------

TITLE: Route Context Helper
DESCRIPTION: app/users/\[id\]/route.ts
SOURCE: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
LANGUAGE: text
CODE:
```text
import type { NextRequest } from 'next/server'
 
export async function GET(_req: NextRequest, ctx: RouteContext<'/users/[id]'>) {
  const { id } = await ctx.params
  return Response.json({ id })
}
```

----------------------------------------

TITLE: Cookies
DESCRIPTION: TypeScript
SOURCE: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
LANGUAGE: text
CODE:
```text
import { cookies } from 'next/headers'
 
export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
 
  const a = cookieStore.get('a')
  const b = cookieStore.set('b', '1')
  const c = cookieStore.delete('c')
}
```

----------------------------------------

TITLE: Cookies
DESCRIPTION: TypeScript
SOURCE: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
LANGUAGE: text
CODE:
```text
import { cookies } from 'next/headers'
 
export async function GET(request: Request) {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')
 
  return new Response('Hello, Next.js!', {
    status: 200,
    headers: { 'Set-Cookie': `token=${token.value}` },
  })
}
```

----------------------------------------

TITLE: Cookies
DESCRIPTION: TypeScript
SOURCE: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
LANGUAGE: text
CODE:
```text
import { type NextRequest } from 'next/server'
 
export async function GET(request: NextRequest) {
  const token = request.cookies.get('token')
}
```

----------------------------------------

TITLE: Headers
DESCRIPTION: TypeScript
SOURCE: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
LANGUAGE: text
CODE:
```text
import { headers } from 'next/headers'
import type { NextRequest } from 'next/server'
 
export async function GET(request: NextRequest) {
  const headersList = await headers()
  const referer = headersList.get('referer')
}
```

----------------------------------------

TITLE: Headers
DESCRIPTION: TypeScript
SOURCE: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
LANGUAGE: text
CODE:
```text
import { headers } from 'next/headers'
 
export async function GET(request: Request) {
  const headersList = await headers()
  const referer = headersList.get('referer')
 
  return new Response('Hello, Next.js!', {
    status: 200,
    headers: { referer: referer },
  })
}
```

----------------------------------------

TITLE: Headers
DESCRIPTION: TypeScript
SOURCE: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
LANGUAGE: text
CODE:
```text
import { type NextRequest } from 'next/server'
 
export async function GET(request: NextRequest) {
  const requestHeaders = new Headers(request.headers)
}
```

----------------------------------------

TITLE: Revalidating Cached Data
DESCRIPTION: TypeScript
SOURCE: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
LANGUAGE: text
CODE:
```text
export const revalidate = 60
 
export async function GET() {
  const data = await fetch('https://api.vercel.app/blog')
  const posts = await data.json()
 
  return Response.json(posts)
}
```

----------------------------------------

TITLE: Redirects
DESCRIPTION: TypeScript
SOURCE: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
LANGUAGE: text
CODE:
```text
import { redirect } from 'next/navigation'
 
export async function GET(request: Request) {
  redirect('https://nextjs.org/')
}
```

----------------------------------------

TITLE: Dynamic Route Segments
DESCRIPTION: TypeScript
SOURCE: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
LANGUAGE: text
CODE:
```text
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params // 'a', 'b', or 'c'
}
```

----------------------------------------

TITLE: URL Query Parameters
DESCRIPTION: TypeScript
SOURCE: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
LANGUAGE: text
CODE:
```text
import { type NextRequest } from 'next/server'
 
export function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('query')
  // query is "hello" for /api/search?query=hello
}
```

----------------------------------------

TITLE: Streaming
DESCRIPTION: TypeScript
SOURCE: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
LANGUAGE: text
CODE:
```text
import { openai } from '@ai-sdk/openai'
import { StreamingTextResponse, streamText } from 'ai'
 
export async function POST(req: Request) {
  const { messages } = await req.json()
  const result = await streamText({
    model: openai('gpt-4-turbo'),
    messages,
  })
 
  return new StreamingTextResponse(result.toAIStream())
}
```

----------------------------------------

TITLE: Streaming
DESCRIPTION: TypeScript
SOURCE: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
LANGUAGE: text
CODE:
```text
// https://developer.mozilla.org/docs/Web/API/ReadableStream#convert_async_iterator_to_stream
function iteratorToStream(iterator: any) {
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next()
 
      if (done) {
        controller.close()
      } else {
        controller.enqueue(value)
      }
    },
  })
}
 
function sleep(time: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, time)
  })
}
 
const encoder = new TextEncoder()
 
async function* makeIterator() {
  yield encoder.encode('<p>One</p>')
  await sleep(200)
  yield encoder.encode('<p>Two</p>')
  await sleep(200)
  yield encoder.encode('<p>Three</p>')
}
 
export async function GET() {
  const iterator = makeIterator()
  const stream = iteratorToStream(iterator)
 
  return new Response(stream)
}
```

----------------------------------------

TITLE: Request Body
DESCRIPTION: TypeScript
SOURCE: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
LANGUAGE: text
CODE:
```text
export async function POST(request: Request) {
  const res = await request.json()
  return Response.json({ res })
}
```

----------------------------------------

TITLE: Request Body FormData
DESCRIPTION: TypeScript
SOURCE: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
LANGUAGE: text
CODE:
```text
export async function POST(request: Request) {
  const formData = await request.formData()
  const name = formData.get('name')
  const email = formData.get('email')
  return Response.json({ name, email })
}
```

----------------------------------------

TITLE: CORS
DESCRIPTION: TypeScript
SOURCE: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
LANGUAGE: text
CODE:
```text
export async function GET(request: Request) {
  return new Response('Hello, Next.js!', {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
```

----------------------------------------

TITLE: Webhooks
DESCRIPTION: TypeScript
SOURCE: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
LANGUAGE: text
CODE:
```text
export async function POST(request: Request) {
  try {
    const text = await request.text()
    // Process the webhook payload
  } catch (error) {
    return new Response(`Webhook error: ${error.message}`, {
      status: 400,
    })
  }
 
  return new Response('Success!', {
    status: 200,
  })
}
```

----------------------------------------

TITLE: Non-UI Responses
DESCRIPTION: TypeScript
SOURCE: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
LANGUAGE: text
CODE:
```text
export async function GET() {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
 
<channel>
  <title>Next.js Documentation</title>
  <link>https://nextjs.org/docs</link>
  <description>The React Framework for the Web</description>
</channel>
 
</rss>`,
    {
      headers: {
        'Content-Type': 'text/xml',
      },
    }
  )
}
```

----------------------------------------

TITLE: Segment Config Options
DESCRIPTION: TypeScript
SOURCE: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
LANGUAGE: text
CODE:
```text
export const dynamic = 'auto'
export const dynamicParams = true
export const revalidate = false
export const fetchCache = 'auto'
export const runtime = 'nodejs'
export const preferredRegion = 'auto'
```

----------------------------------------
<<<DEVFLOW_STACK_REF_END>>>
