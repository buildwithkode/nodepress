/** @type {import('next').NextConfig} */
const nextConfig = {
  // sanitize-html is only used on the server; keep it out of the bundler.
  serverExternalPackages: ['sanitize-html'],
};

export default nextConfig;
