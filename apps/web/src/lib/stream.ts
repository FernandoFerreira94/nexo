import { StreamEvent } from '@nexo/shared'

/**
 * Lê a resposta NDJSON do servidor (um evento JSON por linha) e entrega cada evento
 * assim que chega, para a tela mostrar "consultando..." e o texto aparecendo aos poucos.
 */
export async function readEvents(
  response: Response,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  if (!response.body) return
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      const parsed = StreamEvent.safeParse(JSON.parse(line))
      if (parsed.success) onEvent(parsed.data)
    }
  }
}
