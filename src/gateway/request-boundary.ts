/** Native CLI/Desktop/Relay clients use originless loopback requests. */
export function isAllowedGatewayRequest(request: Request, port: number): boolean {
  const url = new URL(request.url);
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
  if (port === 80) for (const host of ["127.0.0.1", "localhost", "[::1]"]) allowedHosts.add(host);
  if (!allowedHosts.has(url.host)) return false;
  const host = request.headers.get("host");
  if (host !== null && !allowedHosts.has(host.toLowerCase())) return false;

  // There is no browser UI on this endpoint. Reject all supplied Origins,
  // including null/file origins, rather than trusting another localhost app.
  // Host validation also closes the originless DNS-rebinding/enumeration path.
  return !request.headers.has("origin");
}
