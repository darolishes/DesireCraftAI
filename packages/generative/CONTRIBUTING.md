# Contributing

## Development

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Make your changes in a feature branch:

   ```bash
   git checkout -b feature/your-feature
   ```

3. Follow the code style:

   - Use TypeScript
   - Add proper types
   - Write tests for new features
   - Update documentation

4. Run checks:

   ```bash
   pnpm lint
   pnpm format
   pnpm build
   ```

5. Create a pull request

## Project Structure

```
generative/
├── lib/           # Core implementation
│   └── client.ts  # Ollama client
├── types.ts       # Type definitions
└── index.ts      # Public API
```

## Guidelines

1. **Types**

   - Use TypeScript
   - Add Zod schemas for validation
   - Export types from types.ts

2. **Error Handling**

   - Use custom error types
   - Add proper error messages
   - Handle edge cases

3. **Testing**

   - Write unit tests
   - Test error cases
   - Mock external dependencies

4. **Documentation**
   - Update README.md
   - Add JSDoc comments
   - Include examples
