import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextVitals,
  {
    name: "local/generated-ignores",
    ignores: ["src/generated/**"]
  }
];

export default config;
