import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'

// Sem globals, o cleanup do Testing Library é manual.
afterEach(() => {
  cleanup()
})
