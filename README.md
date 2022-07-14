# Docploy Action

The Docploy action deploys documentation to GitHub Pages. The documentation is tightly coupled with your code, which prevents documentation from going out of date. All code snippets used in the docuemntation can be imported and tested.

Traditionally, there are no checks to guarantee that documentation stays up to date. There might be a process where documentation is manually proofread at regular intervals, but this does not scale as you reach hundreds of pages of documentation. This process is like if you had to manually run your code's unit tests each week. Instead, this action will not allow you to deploy broken documentation, so you can rest knowing your documentation is always correct.

# Setup

## Set up GitHub Pages

1. Go to your repo's **Settings** page
2. Click on **Pages** in the left sidebar
3. Under **Source**, select the **gh-pages** branch (this is recommended, but you can select another branch), and click **Save**

_Note: this action will overwrite the contents in the branch you select!_

## Add action to your workflow

You can add a new job to your GitHub workflow yml file located at `.github/workflows/main.yml`

```
on: [push]

jobs:
  publish_docs:
    name: Publish docs
    runs-on: ubuntu-latest
    steps:
      - name: Publish docs
        uses: docploy/docploy-action@{version}
        with:
          baseUrl: 'https://{username}.github.io/{repo}/'
          docsDir: 'docs'
```

# Usage

You should write all documentation as Markdown files (with file extension `.md`) inside of the `docsDir` path defined in your GitHub Action's job metadata.

When the Docploy GitHub Action runs, the output will contain a link to the preview documentation site:

```
Waiting for docs to be deployed to: https://{username}.github.io/{repo}/e6c2d5b
Waiting for docs to be deployed to: https://{username}.github.io/{repo}/e6c2d5b
We successfully deployed the docs on: https://{username}.github.io/{repo}/e6c2d5b
```

# Testing Your Docs

You can use a `<% snippet path={path} %>` tag to import a code snippet into your docs during build time.

The `path` attribute is the location to your code snippet relative to the `docsDir` that you specified as part of the job metadata.

The advantage of using a `<% snippet %>` tag, instead of embedding the code into the Markdown file, is you can import any dependencies from the file and you can run your chosen testing framework on the file.

## Example

This `docs/example.md` file will render the code from the `example.js` file:

```
# Code snippet

{% snippet path="example.js" /%}
```

The `example.js` file is located at `docs/example.js`:

```
function snippet() {
  return 1 + 1;
}

export default snippet;
```

The test file, `example.test.js`, uses the Jest testing framework for Javascript, and it is located at `docs/example.test.js`:

```
import example from './example';

describe('example', () => {
  it('should return 2', () => {
    const result = example();
    expect(result).toBe(2);
  });
});

```

# Running Your Tests

You should run your doc tests on every new pull request that modifies your docs. This will guarantee your docs will always be up to date.

## Javascript

You can run Jest as part of your GitHub workflow to test your doc snippets.
Add the following job to your GitHub workflow yml file located at `.github/workflows/main.yml`

It is a best practice to run the testing job as a separate job from the deploy job to parallelize the two jobs, so they can finish quicker.

```
jobs:
  ...
  test_docs:
    name: Test docs
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: |
          yarn install
          yarn run jest docs
```
