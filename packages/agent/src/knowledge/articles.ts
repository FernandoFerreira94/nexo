/** Central de ajuda (Anexo B). Texto curto, escrito para o funcionário ler. */
export type Article = {
  id: string
  title: string
  /** Palavras que ajudam a busca a achar o artigo (sinônimos que o funcionário usa). */
  keywords: string[]
  body: string
}

export const ARTICLES: readonly Article[] = [
  {
    id: 'KB-001',
    title: 'VPN com erro 809',
    keywords: [
      'vpn',
      'erro 809',
      '809',
      'conectar',
      'rede remota',
      'home office',
      'windows 10',
      'windows 11',
    ],
    body:
      'O erro 809 na VPN acontece no Windows 10 quando a porta UDP 500 é bloqueada pelo roteador de casa. ' +
      'No Windows 10: abra "Configurações > Rede > VPN", remova a conexão "Nexo VPN" e adicione de novo usando o tipo "IKEv2"; depois reinicie o computador. ' +
      'No Windows 11 este procedimento NÃO resolve: abra um chamado de Rede e VPN informando que é Windows 11.',
  },
  {
    id: 'KB-002',
    title: 'Horário de atendimento do service desk',
    keywords: ['horário', 'atendimento', 'service desk', 'plantão', 'fim de semana', 'funciona'],
    body:
      'O service desk atende de segunda a sexta, das 8h às 18h (horário de Brasília). ' +
      'Chamados críticos (algo parado para uma equipe ou para a empresa) têm plantão 24 horas.',
  },
  {
    id: 'KB-003',
    title: 'Como trocar ou desbloquear a senha de rede',
    keywords: ['senha', 'bloqueada', 'bloqueio', 'trocar senha', 'esqueci', 'expirada', 'login'],
    body:
      'Acesse senha.nexo.com, informe seu e-mail corporativo e siga o código enviado ao celular cadastrado. ' +
      'A conta desbloqueia na hora. Se o celular não estiver cadastrado, abra um chamado de Acesso.',
  },
  {
    id: 'KB-004',
    title: 'Configurar a impressora da sua área',
    keywords: ['impressora', 'imprimir', 'impressão', 'scanner', 'papel'],
    body:
      'No Windows, abra "Impressoras e scanners", clique em "Adicionar" e escolha a impressora com o nome do seu andar (ex.: NEXO-3A). ' +
      'Se a impressora mostrar erro físico (papel atolado, toner), abra um chamado de Hardware.',
  },
  {
    id: 'KB-005',
    title: 'Outlook não sincroniza',
    keywords: ['outlook', 'email', 'e-mail', 'sincroniza', 'caixa', 'compartilhada', 'emails'],
    body:
      'Feche o Outlook, abra "Painel de Controle > Email > Perfis", crie um perfil novo e defina como padrão. ' +
      'Caixas compartilhadas podem levar até 30 minutos para aparecer depois disso.',
  },
  {
    id: 'KB-006',
    title: 'Teams sem áudio ou microfone',
    keywords: ['teams', 'áudio', 'audio', 'microfone', 'som', 'reunião', 'fone', 'ouvir'],
    body:
      'No Teams, clique na sua foto > Configurações > Dispositivos e escolha o fone ou microfone correto. ' +
      'Faça uma chamada de teste. Se o dispositivo não aparecer, abra um chamado de Software.',
  },
  {
    id: 'KB-007',
    title: 'Pedir software ou acesso a sistema',
    keywords: ['instalar', 'software', 'programa', 'licença', 'acesso', 'permissão', 'sistema'],
    body:
      'Softwares e acessos são pedidos por requisição (REQ). Informe o nome do sistema, o tipo de acesso (leitura ou edição) e o motivo. ' +
      'Alguns acessos exigem aprovação do seu gestor.',
  },
  {
    id: 'KB-008',
    title: 'Computador lento',
    keywords: [
      'lento',
      'lentidão',
      'travando',
      'trava',
      'demora',
      'notebook',
      'computador',
      'atualização',
    ],
    body:
      'Reinicie o computador (não só bloqueie a tela) e deixe as atualizações terminarem. ' +
      'Feche abas e programas que não estiver usando. Se continuar lento depois de reiniciar, abra um chamado de Hardware.',
  },
]
