/**
 * GitHub event payload type definitions
 */

export interface GitHubEventPayload {
  action?: string
  [key: string]: unknown
}

export interface IssueEventPayload extends GitHubEventPayload {
  issue: {
    number: number
    title: string
    body?: string
    state: string
    user: {
      login: string
    }
    labels: Array<{
      name: string
    }>
    html_url: string
    pull_request?: {
      url: string
      html_url: string
      diff_url: string
      patch_url: string
      merged_at: string | null
    }
  }
  repository: {
    name: string
    owner: {
      login: string
    }
    full_name: string
  }
}

export interface PullRequestEventPayload extends GitHubEventPayload {
  pull_request: {
    number: number
    title: string
    body?: string
    state: string
    draft?: boolean
    user: {
      login: string
    }
    head: {
      ref: string
      sha: string
    }
    base: {
      ref: string
      sha: string
    }
    html_url: string
  }
  repository: {
    name: string
    owner: {
      login: string
    }
    full_name: string
  }
}

export interface PushEventPayload extends GitHubEventPayload {
  ref: string
  before: string
  after: string
  repository: {
    name: string
    owner: {
      login: string
      name?: string
    }
    full_name: string
  }
  pusher: {
    name: string
    email: string
  }
  commits: Array<{
    id: string
    message: string
    author: {
      name: string
      email: string
    }
  }>
}

export interface ReleaseEventPayload extends GitHubEventPayload {
  release: {
    tag_name: string
    name: string
    body?: string
    draft: boolean
    prerelease: boolean
    html_url: string
  }
  repository: {
    name: string
    owner: {
      login: string
    }
    full_name: string
  }
}

export interface ReviewEventPayload extends GitHubEventPayload {
  review: {
    id: number
    body?: string
    state: string
    user: {
      login: string
    }
    html_url: string
  }
  pull_request: {
    number: number
    title: string
    html_url: string
  }
  repository: {
    name: string
    owner: {
      login: string
    }
    full_name: string
  }
}

export interface StatusEventPayload extends GitHubEventPayload {
  sha: string
  state: string
  description?: string
  target_url?: string
  context: string
  repository: {
    name: string
    owner: {
      login: string
    }
    full_name: string
  }
}
