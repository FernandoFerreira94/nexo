import { expect, test } from '@playwright/test'

/**
 * Fluxo principal da demo: a Ana relata um problema, confirma o rascunho, pede um analista,
 * e o Marcos assume e responde pelo console.
 */
test('funcionário abre chamado com confirmação e analista assume a conversa', async ({
  browser,
}) => {
  const ana = await browser.newPage()
  await ana.goto('/login')
  await ana.getByRole('button', { name: /Ana Souza/ }).click()
  await ana.waitForURL('**/chat')

  await ana
    .getByLabel('Mensagem')
    .fill('A VPN dá erro 809 e não consigo trabalhar. Uso Windows 11.')
  await ana.getByRole('button', { name: 'Enviar' }).click()

  await expect(ana.getByText('classificou a prioridade e montou o rascunho')).toBeVisible()
  await expect(ana.getByText('Rascunho do chamado', { exact: true })).toBeVisible()
  await ana.getByRole('button', { name: 'Confirmar' }).click()
  await expect(ana.getByText(/Pronto! Abri o INC-\d+/)).toBeVisible()

  await ana.getByLabel('Mensagem').fill('Quero falar com um analista')
  await ana.getByRole('button', { name: 'Enviar' }).click()
  await expect(ana.getByText('Aguardando analista').first()).toBeVisible()

  const marcos = await browser.newPage()
  await marcos.goto('/login')
  await marcos.getByRole('tab', { name: 'Analista' }).click()
  await marcos.getByRole('button', { name: /Marcos Alves/ }).click()
  await marcos.waitForURL('**/console')
  await marcos.getByRole('button', { name: /Ana Souza/ }).click()
  await expect(marcos.getByText('Resumo da transferência')).toBeVisible()
  await marcos.getByRole('button', { name: 'Assumir' }).click()
  await marcos.getByLabel('Resposta ao funcionário').fill('Oi Ana, sou o Marcos. Já estou vendo.')
  await marcos.getByRole('button', { name: 'Enviar' }).click()

  await expect(ana.getByText('Oi Ana, sou o Marcos. Já estou vendo.')).toBeVisible({
    timeout: 10_000,
  })
})

test('funcionário não acessa o console', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: /Bruno Lima/ }).click()
  await page.waitForURL('**/chat')
  await page.goto('/console')
  await expect(page).toHaveURL(/\/chat$/)
  const response = await page.request.get('/api/console/queue')
  expect(response.status()).toBe(403)
})
