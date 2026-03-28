import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "web-tree-sitter",
    "tree-sitter-typescript",
    "tree-sitter-javascript",
  ],
};

export default nextConfig;
