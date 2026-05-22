#!/bin/sh
basedir=$(dirname "$(echo "$0" | sed -e 's,\\,/,g')")

case `uname` in
    *CYGWIN*) basedir=`cygpath -w "$basedir"`;;
esac

if [ -z "$NODE_PATH" ]; then
  export NODE_PATH="/Users/rubenmangorrinha/vscode-mermaid-chart/node_modules/.pnpm/vite@6.3.5_@types+node@18.19.119_terser@5.43.1_yaml@2.8.0/node_modules/vite/bin/node_modules:/Users/rubenmangorrinha/vscode-mermaid-chart/node_modules/.pnpm/vite@6.3.5_@types+node@18.19.119_terser@5.43.1_yaml@2.8.0/node_modules/vite/node_modules:/Users/rubenmangorrinha/vscode-mermaid-chart/node_modules/.pnpm/vite@6.3.5_@types+node@18.19.119_terser@5.43.1_yaml@2.8.0/node_modules:/Users/rubenmangorrinha/vscode-mermaid-chart/node_modules/.pnpm/node_modules"
else
  export NODE_PATH="/Users/rubenmangorrinha/vscode-mermaid-chart/node_modules/.pnpm/vite@6.3.5_@types+node@18.19.119_terser@5.43.1_yaml@2.8.0/node_modules/vite/bin/node_modules:/Users/rubenmangorrinha/vscode-mermaid-chart/node_modules/.pnpm/vite@6.3.5_@types+node@18.19.119_terser@5.43.1_yaml@2.8.0/node_modules/vite/node_modules:/Users/rubenmangorrinha/vscode-mermaid-chart/node_modules/.pnpm/vite@6.3.5_@types+node@18.19.119_terser@5.43.1_yaml@2.8.0/node_modules:/Users/rubenmangorrinha/vscode-mermaid-chart/node_modules/.pnpm/node_modules:$NODE_PATH"
fi
if [ -x "$basedir/node" ]; then
  exec "$basedir/node"  "$basedir/../../../../../../vite@6.3.5_@types+node@18.19.119_terser@5.43.1_yaml@2.8.0/node_modules/vite/bin/vite.js" "$@"
else
  exec node  "$basedir/../../../../../../vite@6.3.5_@types+node@18.19.119_terser@5.43.1_yaml@2.8.0/node_modules/vite/bin/vite.js" "$@"
fi
