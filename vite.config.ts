import { defineConfig } from 'vite';

function getGithubPagesBase(): string {
  const repository = process.env.GITHUB_REPOSITORY;

  if (!repository) {
    return '/';
  }

  const [, repoName] = repository.split('/');
  return repoName ? `/${repoName}/` : '/';
}

export default defineConfig({
  base: getGithubPagesBase(),
});
