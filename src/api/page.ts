/* eslint-disable no-use-before-define */
import { writeFile } from 'fs'
import makethen from 'makethen'
import { TJsonValue } from 'typeon'

import { TSend } from '../protocol'
import createElement from './element'

const pWriteFile = makethen(writeFile)

type TScreenshotOptions = {
  path?: string
}

type TStringifiableFunction = (...args: TJsonValue[]) => TJsonValue | Promise<TJsonValue>

const createPage = (send: TSend, id: number) => {
  const switchToPage = () => send('WebDriver:SwitchToWindow', {
    name: id
  })

  return {
    $: async (selector: string) => {
      await switchToPage()

      try {
        type TResult = {
          value: {
            ELEMENT: string
          }
        }

        const { value }: TResult = await send('WebDriver:FindElement', {
          value: selector,
          using: 'css selector'
        })

        return createElement(send, value.ELEMENT)
      } catch (err) {
        if (err.error === 'no such element') {
          return null
        }

        throw err
      }
    },

    $$: async (selector: string) => {
      await switchToPage()

      type TResult = {
        ELEMENT: string
      }

      const values: TResult[] = await send('WebDriver:FindElements', {
        value: selector,
        using: 'css selector'
      })

      return values.map((value) => createElement(send, value.ELEMENT))
    },

    close: async () => {
      await switchToPage()
      await send('WebDriver:ExecuteScript', {
        script: 'window.close()'
      })
    },

    content: async (): Promise<string> => {
      await switchToPage()

      type TResult = {
        value: string
      }
      const { value }: TResult = await send('WebDriver:GetPageSource')

      return value
    },

    evaluate: async (target: TStringifiableFunction | string, ...args: TJsonValue[]): Promise<TJsonValue> => {
      await switchToPage()

      type TResult = {
        value: {
          error: string | null,
          value: TJsonValue
        }
      }

      if (typeof target === 'function') {
        const { value: result }: TResult = await send('WebDriver:ExecuteAsyncScript', {
          script: `
          const args = Array.prototype.slice.call(arguments, 0, arguments.length - 1)
          const resolve = arguments[arguments.length - 1]

          Promise.resolve()
            .then(() => (${target.toString()})(...args))
            .then((value) => resolve({ error: null, value }))
            .catch((error) => resolve({ error: error instanceof Error ? error.message : error }))
        `,
          args
        })

        if (result.error !== null) {
          throw new Error(`Evaluation failed: ${result.error}`)
        }

        return result.value
      }

      const { value: result }: TResult = await send('WebDriver:ExecuteAsyncScript', {
        script: `
          const resolve = arguments[0]

          Promise.resolve()
            .then(() => ${target})
            .then((value) => resolve({ error: null, value }))
            .catch((error) => resolve({ error: error instanceof Error ? error.message : error }))
        `
      })

      if (result.error !== null) {
        throw new Error(`Evaluation failed: ${result.error}`)
      }

      return result.value
    },

    goto: async (url: string) => {
      await switchToPage()
      await send('WebDriver:Navigate', { url })
    },

    screenshot: async (options: TScreenshotOptions = {}): Promise<Buffer> => {
      await switchToPage()

      const result = await send('WebDriver:TakeScreenshot', {
        full: true,
        hash: false
      })
      const buffer = Buffer.from(result.value, 'base64')

      if (typeof options.path === 'string') {
        await pWriteFile(options.path, buffer)
      }

      return buffer
    },

    setContent: async (html: string) => {
      await switchToPage()

      return send('WebDriver:ExecuteScript', {
        script: 'document.documentElement.innerHTML = arguments[0]',
        args: [html]
      })
    },

    title: async (): Promise<string> => {
      await switchToPage()

      const result = await send('WebDriver:GetTitle')

      return result.value
    }
  }
}

export default createPage
