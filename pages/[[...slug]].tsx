import { GetStaticPaths, GetStaticProps } from 'next';

import Markdoc from '@markdoc/markdoc';
import NavTree from 'src/components/NavTree';
import type { NextPage } from 'next';
import { ParsedUrlQuery } from 'querystring';
import React from 'react';
import components from 'src/components';
import config from 'src/schema';
import fs from 'fs';
import glob from 'glob-promise';
import path from 'path';
import { type NavTreeType } from 'src/types';
import {
  getProjectDir,
  getDocsDir,
  getSlugFromPath,
  getTitleFromToken,
  getPathFromSlug,
} from 'src/utils/helpers';
import { parse } from 'yaml';
import matter from 'gray-matter';
import Head from 'next/head';

type Props = {
  title: string;
  description: string;
  content: string;
  navData: NavTreeType;
};

interface Params extends ParsedUrlQuery {
  docPath: string;
  slug: string[];
}

function getNavTreePath(slug: string[], level: number) {
  // We cannot destructure Next env vars because they are statically injected
  const fullBaseUrl = process.env.FULL_BASE_URL;

  const navTreePath = fullBaseUrl + '/' + slug.slice(0, level + 1).join('/');

  return navTreePath;
}

const ROOT_KEY = '_';

function sortNavTreeLevel(
  navTree: NavTreeType,
  orderMap: { [key: string]: string[] }
) {
  const compare = (order: string[]) => {
    return (a: NavTreeType, b: NavTreeType): number => {
      const aToken = a.token;
      const bToken = b.token;

      const aPlace = order.indexOf(aToken);
      const bPlace = order.indexOf(bToken);
      // If child does not exist in the ordered list, then we do not need to prioritize its order
      // So, return 1 so a is at the end
      if (aPlace === -1) {
        return 1;
      }
      if (bPlace === -1) {
        return -1;
      }
      return aPlace - bPlace;
    };
  };

  // Use BFS to sort the children for each node in the navTree
  const queue: NavTreeType[] = [navTree];
  while (queue.length > 0) {
    // Start by rearranging all of the children in the NavTree in the correct order
    const curTree: NavTreeType | undefined = queue.shift();
    if (curTree) {
      if (curTree.children) {
        // The root NavTree is represented by a token that is empty string, ''
        // The orderMap uses the ROOT_KEY to represent the root
        // Make sure to use this special key
        const orderMapKey = curTree.token === '' ? ROOT_KEY : curTree.token;
        const sortOrder = orderMap[orderMapKey];

        curTree.children.sort(compare(sortOrder));
        curTree.children.forEach((childNavTree: NavTreeType) => {
          queue.push(childNavTree);
        });
      }
    }
  }
}

// TODO: Move this into a utility function
function hasKey<O>(obj: O, key: PropertyKey): key is keyof O {
  return key in obj;
}

function getFirstObjectKey(obj: Object) {
  const keys = Object.keys(obj);
  if (keys.length === 1) {
    return keys[0];
  }
  throw new Error('getFirstObjectKey only accepts an object with one key');
}

// Use BFS to create an order map from the sidebar config
function createOrderMap(sidebarConfig: Object) {
  const queue: Object[] = [sidebarConfig];
  const orderMap: { [key: string]: string[] } = {};

  while (queue.length > 0) {
    const item = queue.shift();
    const key = getFirstObjectKey(item || {});
    if (item && hasKey(item, key)) {
      const children: (Object | string)[] = item[key] as unknown as (
        | Object
        | string
      )[];
      orderMap[key] = [];
      (children as string[]).forEach((child: string | object) => {
        if (typeof child == 'string') {
          orderMap[key].push(child);
        } else if (typeof child === 'object') {
          const childKey = getFirstObjectKey(child);
          orderMap[key].push(childKey);
          queue.push(child);
        }
      });
    }
  }

  return orderMap;
}

// Sort the navigation tree sidebar based on the ordering found in sidebar.yaml
function sortNavTree(navTree: NavTreeType) {
  const baseProjectDir = getProjectDir();
  const sidebarConfigPath = path.join(baseProjectDir, 'sidebar.yaml');
  let orderMap;

  if (fs.existsSync(sidebarConfigPath)) {
    const order = parse(fs.readFileSync(sidebarConfigPath, 'utf-8'));
    orderMap = createOrderMap({ [ROOT_KEY]: order });
  }

  if (orderMap) {
    sortNavTreeLevel(navTree, orderMap);
  }
}

// TODO: We are processing the gray-matter of every document.
// This could be a source of long build times when projects have many documents.
// This is especially true since this function only adds name data.
function addExtraNavData(navTree: NavTreeType) {
  const queue: NavTreeType[] = [navTree];

  while (queue.length > 0) {
    const curTree = queue.shift();

    // Assign titles to all of the tree nodes
    if (curTree) {
      const slug = curTree.relPath.split('/').slice(1);
      let title = getTitleFromToken(curTree.token);
      const fullPath = getPathFromSlug(slug);
      if (fs.existsSync(fullPath)) {
        const {
          data: { title: matterTitle },
        } = matter.read(fullPath);

        // Use the matter title if it exists
        title = matterTitle || title;
      }
      curTree.name = title;
      curTree.children.forEach((child: NavTreeType) => {
        queue.push(child);
      });
    }
  }

  return navTree;
}

async function createNavTree() {
  const baseDocsDir = getDocsDir();

  const docPaths = await glob(path.join(baseDocsDir, '**/*.md'));
  const navTree: NavTreeType = {
    path: '/',
    relPath: '/',
    token: '',
    name: '',
    type: 'directory',
    children: [],
  };

  for (const docPath of docPaths) {
    const relPath = docPath.substring(baseDocsDir.length);
    const slug = getSlugFromPath(relPath);

    // Start at the root
    let currentBranch: NavTreeType = navTree;

    slug.forEach((token, i) => {
      // Use `index` as the token for the root document so we can order it using sidebar.yaml
      if (token === '') {
        token = 'index';
      }

      const match = currentBranch.children.find((node: any) => {
        return node.token === token;
      });
      const navTreePath = getNavTreePath(slug, i);
      const relPath = navTreePath.slice(
        (process.env.FULL_BASE_URL || '').length
      );

      if (match) {
        currentBranch = match;
      } else {
        const newNode: NavTreeType = {
          path: navTreePath,
          relPath,
          token,
          name: '',
          type: i === slug.length - 1 ? 'file' : 'directory',
          children: [],
        };
        currentBranch.children.push(newNode);
        currentBranch = newNode;
      }
    });

    // reset pointer to root
    currentBranch = navTree;
  }

  sortNavTree(navTree);

  return navTree;
}

export const getStaticPaths: GetStaticPaths = async () => {
  const baseDocsDir = getDocsDir();
  const docPaths = await glob(baseDocsDir + '/**/*.md');

  const paths = docPaths.map((docPath: string) => {
    const relPath = docPath.substring(baseDocsDir.length);
    const slug = getSlugFromPath(relPath);
    return { params: { slug } };
  });

  return { paths, fallback: false };
};

export const getStaticProps: GetStaticProps<Props, Params> = async (
  context
) => {
  const { params } = context;
  // default slug to be empty for the case where we are in the top level directory's index.md
  const slug = params?.slug || [];
  const fullPath = getPathFromSlug(slug);
  const source = fs.readFileSync(fullPath, 'utf-8');
  const {
    data: { title: matterTitle, description: matterDescription },
    content: matterContent,
  } = matter(source);

  const title = matterTitle || getTitleFromToken(slug[slug.length - 1]);
  const description = matterDescription || '';

  const ast = Markdoc.parse(matterContent);
  const errors = Markdoc.validate(ast, config);

  if (errors.length > 0) {
    console.error(errors);
    throw new Error('Failed validation on Markdown');
  }

  const content = JSON.stringify(Markdoc.transform(ast, config));

  const navData = await createNavTree();
  addExtraNavData(navData);

  return {
    props: {
      title,
      description,
      content,
      navData,
    },
  };
};

const Home: NextPage<Props> = (props) => {
  const { content, navData, title, description } = props;
  const parsedContent = JSON.parse(content);

  return (
    <div className="flex flex-col m-auto p-8 max-w-7xl">
      <Head>
        <title>{title}</title>
      </Head>
      <div className="flex">
        <div className="basis-72">
          <div className="h-screen p-8 overflow-y-auto">
            <NavTree navData={navData} />
          </div>
        </div>
        <div className="basis-0 grow p-16">
          <div className="max-w-3xl">
            <h1 className="font-bold mt-8 text-4xl">{title}</h1>
            {!!description && (
              <div className="my-2 text-slate-500 text-2xl">{description}</div>
            )}
            {Markdoc.renderers.react(parsedContent, React, {
              components,
            })}
          </div>
        </div>
      </div>
      <div className="text-center">
        Made with{' '}
        <a href="https://docploy.com" className="font-bold text-blue-400">
          Docploy
        </a>
      </div>
    </div>
  );
};

export default Home;
