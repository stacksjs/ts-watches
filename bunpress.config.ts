// eslint-disable-next-line ts/explicit-function-return-type
const config = {
  title: 'ts-watches',
  description: 'A comprehensive TypeScript library for downloading, parsing, and analyzing data from smartwatches and fitness devices',

  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/intro' },
      { text: 'API', link: '/api' },
      { text: 'GitHub', link: 'https://github.com/stacksjs/ts-watches' },
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Introduction', link: '/intro' },
          { text: 'Installation', link: '/install' },
          { text: 'Usage Guide', link: '/usage' },
          { text: 'Configuration', link: '/config' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'API Reference', link: '/api' },
        ],
      },
      {
        text: 'Community',
        items: [
          { text: 'Team', link: '/team' },
          { text: 'Sponsors', link: '/sponsors' },
          { text: 'Partners', link: '/partners' },
          { text: 'Stargazers', link: '/stargazers' },
          { text: 'Postcardware', link: '/postcardware' },
          { text: 'License', link: '/license' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/stacksjs/ts-watches' },
      { icon: 'discord', link: 'https://discord.gg/stacksjs' },
      { icon: 'twitter', link: 'https://twitter.com/stacksjs' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-present Stacks.js',
    },

    search: {
      enabled: true,
      placeholder: 'Search documentation...',
    },
  },

  markdown: {
    toc: {
      enabled: true,
      minDepth: 2,
      maxDepth: 4,
    },

    features: {
      containers: true,
      githubAlerts: true,
      codeGroups: true,
      emoji: true,
      badges: true,
    },
  },

  sitemap: {
    enabled: true,
    baseUrl: 'https://ts-watches.netlify.app',
  },
} as const

export default config
