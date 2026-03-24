import stylistic from "@stylistic/eslint-plugin";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import nextVitals from "eslint-config-next/core-web-vitals";
import importX, { createNodeResolver } from "eslint-plugin-import-x";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

const typedFiles = ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"];

const config = [
  ...nextVitals,
  ...tseslint.configs.recommendedTypeChecked,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  {
    name: "local/typescript-project-service",
    files: typedFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    settings: {
      "import-x/resolver-next": [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
          project: "./tsconfig.json"
        }),
        createNodeResolver({
          extensions: [".js", ".jsx", ".ts", ".tsx", ".d.ts"]
        })
      ]
    }
  },
  {
    name: "local/community-rules",
    files: typedFiles,
    plugins: {
      "@stylistic": stylistic,
      "unused-imports": unusedImports
    },
    rules: {
      "@stylistic/comma-dangle": ["error", "never"],
      "@stylistic/jsx-quotes": ["error", "prefer-double"],
      "@stylistic/key-spacing": [
        "error",
        {
          singleLine: {
            beforeColon: false,
            afterColon: true
          },
          multiLine: {
            align: {
              on: "colon",
              mode: "strict",
              beforeColon: false,
              afterColon: true
            },
            beforeColon: false,
            afterColon: true
          }
        }
      ],
      "@stylistic/no-multi-spaces": "off",
      "@stylistic/object-curly-spacing": ["error", "always"],
      "@stylistic/quotes": [
        "error",
        "double",
        {
          avoidEscape: true
        }
      ],
      "@stylistic/semi": ["error", "always"],
      "@stylistic/type-annotation-spacing": "off",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports"
        }
      ],
      "@typescript-eslint/no-empty-object-type": [
        "error",
        {
          allowInterfaces: "always"
        }
      ],
      "@typescript-eslint/no-unused-vars": "off",
      "import-x/first": "error",
      "import-x/newline-after-import": "error",
      "import-x/no-named-as-default-member": "off",
      "import-x/no-duplicates": "error",
      "no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
          ignoreRestSiblings: true
        }
      ]
    }
  },
  {
    name: "local/test-relaxations",
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/require-await": "off"
    }
  },
  {
    name: "local/generated-ignores",
    ignores: [
      ".next/**",
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "src/generated/**"
    ]
  }
];

export default config;
