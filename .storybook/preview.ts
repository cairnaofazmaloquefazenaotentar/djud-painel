import type { Preview } from "@storybook/react";
import "../app/globals.css";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: "light",
      values: [
        { name: "light", value: "hsl(var(--background, 0 0% 100%))" },
        { name: "dark",  value: "hsl(220 13% 10%)" },
      ],
    },
  },
};

export default preview;
