#!/bin/bash

echo '清除缓存'
rm -rf dist

echo '将项目文件 cp 到部署目录'
mkdir -p dist/src

cp publish.yaml dist/
cp readme.md dist/

cp package.json dist/src/
cp index.js dist/src/
cp -r utils dist/src/
cp -r node_modules dist/src/

cd dist

echo '发布组件'
s platform publish