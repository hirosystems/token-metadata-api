import { readFileSync } from 'fs';

interface ServerVersion {
  branch: string;
  commit: string;
  tag: string;
}

function getServerVersion(): ServerVersion {
  const [branch, commit, tag] = readFileSync('.git-info', 'utf-8').split('\n');
  return { branch, commit, tag };
}

export const SERVER_VERSION = getServerVersion();
