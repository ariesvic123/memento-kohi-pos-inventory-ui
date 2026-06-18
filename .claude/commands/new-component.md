# /project:new-component

Scaffold a new React component for the Memento Kohi POS system.

## Instructions
The user will provide a component name and location via $ARGUMENTS.

Example usage: `/project:new-component CartSummary admin-portal/components/terminal`

1. Parse the component name and folder path from $ARGUMENTS
2. Create the `.tsx` file at `src/app/components/<path>/<ComponentName>.tsx`
3. Use this exact structure:

```tsx
import React from 'react'

interface <ComponentName>Props {
  // define props here
}

export default function <ComponentName>({ }: <ComponentName>Props) {
  return (
    <div>
      {/* component content */}
    </div>
  )
}
```

4. Use Ant Design components where appropriate (import from 'antd')
5. If styles are needed, create a matching `.scss` file in the same folder
6. Never use `React.FC` — plain function components only
7. Never use `any` type — check `src/app/config/utils/pos.types.ts` for existing interfaces
8. Report the full file path of what was created
