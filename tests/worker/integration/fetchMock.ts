type RequestMatcher = (request: Request) => boolean;

interface MockRoute {
  matcher: RequestMatcher;
  response: Response;
}

const nativeFetch = globalThis.fetch;
let routes: MockRoute[] = [];
let networkDisabled = false;

function toRequest(input: RequestInfo | URL, init?: RequestInit): Request {
  return input instanceof Request && init === undefined ? input : new Request(input, init);
}

export const fetchMock = {
  activate(): void {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = toRequest(input, init);
      const route = routes.find(candidate => candidate.matcher(request));
      if (route) return route.response.clone();
      if (networkDisabled) throw new Error(`Unmocked outbound request: ${request.method} ${request.url}`);
      return nativeFetch(input, init);
    };
  },

  deactivate(): void {
    globalThis.fetch = nativeFetch;
    routes = [];
    networkDisabled = false;
  },

  disableNetConnect(): void {
    networkDisabled = true;
  },

  when(matcher: RequestMatcher): { respondWith(response: Response): void } {
    return {
      respondWith(response: Response): void {
        routes.push({ matcher, response });
      },
    };
  },
};
