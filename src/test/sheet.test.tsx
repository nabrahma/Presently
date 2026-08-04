/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { Sheet } from '../components/Sheet'

/*
  The sheet is the app's only modal surface, so its behaviour is covered here
  directly rather than through a screen. Driving it in isolation also keeps the
  assertions free of route transitions and lazily loaded chunks.
*/
function Harness({ onClose }: { onClose?: () => void } = {}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open sheet
      </button>
      <Sheet
        open={open}
        onClose={() => {
          setOpen(false)
          onClose?.()
        }}
        title="Edit subject"
        description="Change anything you like."
      >
        <label htmlFor="probe-field">Subject name</label>
        <input id="probe-field" />
        <button type="button">Cancel</button>
      </Sheet>
    </>
  )
}

afterEach(cleanup)

describe('Sheet', () => {
  it('is absent until it is opened', () => {
    render(<Harness />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders its title, description and children when opened', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Open sheet' }))

    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByText('Edit subject')).toBeTruthy()
    expect(screen.getByText('Change anything you like.')).toBeTruthy()
    expect(screen.getByLabelText('Subject name')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Open sheet' }))
    await screen.findByRole('dialog')

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('reports closing to its owner so state stays in step', async () => {
    const user = userEvent.setup()
    let closed = 0
    render(<Harness onClose={() => (closed += 1)} />)

    await user.click(screen.getByRole('button', { name: 'Open sheet' }))
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')

    await waitFor(() => expect(closed).toBe(1))
  })

  it('can be reopened after closing', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    for (let round = 0; round < 3; round += 1) {
      await user.click(screen.getByRole('button', { name: 'Open sheet' }))
      expect(await screen.findByRole('dialog')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()

      await user.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    }
  })

  it('keeps the page behind it from scrolling while open', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Open sheet' }))
    await screen.findByRole('dialog')

    // Radix marks the body while a modal owns the screen.
    expect(document.body.hasAttribute('data-scroll-locked')).toBe(true)
  })
})
