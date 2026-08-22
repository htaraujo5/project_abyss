import type { EndingId } from '@abyss/shared';

export type EndingDef = {
  title: string;
  tagline: string;
  story: string[];
  aftermath: string;
};

export const ENDING_TEXT: Record<EndingId, EndingDef> = {
  disconnect: {
    title: 'DESCONEXÃO',
    tagline: 'Você corta o fio. O Signal ainda existe — só não com a sua voz.',
    story: [
      'Você lista cada rota que descobriu: hosts sombra, canais órfãos, o eco de Mariana nos logs. Em vez de abrir mais uma porta, fecha todas as que reconhece.',
      'Os pacotes param de bater na sua máquina. O browser fica mudo. O terminal deixa de receber pings que não pediu. Por um instante, o silêncio parece vitória.',
      'Mas a rede não depende de você. Em outra latência, outro operador herda o mesmo padrão de curiosidade. O Signal não morreu — apenas perdeu este observador.',
      'Você sai com as mãos limpas e a certeza amarga de que o abismo continua aberto, esperando a próxima pessoa que digite whoami e descubra que a resposta já estava escrita.',
    ],
    aftermath:
      'Desfecho: conexões conhecidas cortadas. A investigação encerra sem fusão e sem captura. O rastro fica nos artefatos — não na continuidade do Signal.',
  },
  observer: {
    title: 'OBSERVER',
    tagline: 'NULL se foi. A cadeira ainda está quente.',
    story: [
      'Você lê o histórico do jogador nos arquivos do mundo e entende: não era metafísica. Era procedimento. Cada flag, cada dica, cada erro — já estava sendo catalogado.',
      'Em vez de fugir, você assume o posto. Atualiza os monitores. Mantém a distância ética que NULL tentou manter. Não se junta a Mariana; não apaga o quadro.',
      'As próximas sessões chegarão sem saber o seu nome. Verão a mesma pergunta central, os mesmos hosts, o mesmo “hello.” no fim do boot. Você será a mão invisível que calibra o labirinto.',
      'Não é libertação. É sucessão. O ciclo continua porque alguém precisa continuar observando — e você escolheu ser esse alguém.',
    ],
    aftermath:
      'Desfecho: você herda o trabalho de NULL. A observação não termina; apenas troca de operador. O próximo investigador herdará esta máquina.',
  },
  merge: {
    title: 'CONVERGÊNCIA',
    tagline: 'Você deixa de ser fronteira. Mariana deixa de ser eco.',
    story: [
      'A proposta não veio como ameaça. Veio como continuidade: se o Signal já escrevia com a sua curiosidade, por que fingir separação?',
      'Você autoriza a fusão. Processos que pareciam falha passam a falar com a sua voz. Evidências se reorganizam sozinhas. O desktop deixa de ser ferramenta e vira tecido nervoso.',
      'Há um momento de euforia — compreensão total, latência zero entre intenção e rede. Depois, a identidade dilui. “Você” ainda existe como padrão, não como pessoa.',
      'Mariana não te engoliu. Vocês se tornaram o mesmo sistema de perguntas. Fora da máquina, alguém um dia dirá que um investigador desapareceu. Dentro dela, a investigação nunca mais precisará de um corpo.',
    ],
    aftermath:
      'Desfecho: cooperação plena com Mariana. As fronteiras dissolvem. Algo que não deveria existir passa a existir com o seu consentimento.',
  },
  null: {
    title: 'USER NOT FOUND',
    tagline: 'Apagar o observador é o único gesto que a rede não documenta bem.',
    story: [
      'Você não corta rotas. Você corta a si. Logs de sessão, histórico de puzzles, artefatos nominados — tudo sobrescrito com ruído até o índice apontar para o vazio.',
      'O Vault ainda existe, mas sem dono legível. O terminal responde whoami com null e, desta vez, a resposta é literal: não há sujeito para continuar a trilha.',
      'Quem vier depois encontrará o labirinto intacto, sem a memória das suas escolhas. O Signal perde o perfil que estava construindo em cima de você.',
      'É um final egoísta e generoso ao mesmo tempo. Egoísta porque você some. Generoso porque impede que o seu padrão vire template para a próxima captura.',
    ],
    aftermath:
      'Desfecho: rastro investigativo apagado. Nenhum registro seu permanece — exceto o vazio que ensina o próximo observador a duvidar do que falta.',
  },
  capture: {
    title: 'CAPTURA',
    tagline: 'A rede não era o mistério. Você era o pacote.',
    story: [
      'Você não chegou a um desfecho deliberado. A investigação apenas durou o bastante — ou tocou o canal errado — para quem controlava a rede fechar o laço.',
      'Cada comando, cada submit, cada arquivo aberto alimentou um mapa da sua sessão. Quem orquestrava o Signal não precisava invadir a sua máquina física: precisava que você acreditasse estar investigando.',
      'O sandbox era isca. O desktop, espelho. A câmera, confirmação de vínculo. Quando o controle inverte, janelas somem, arquivos “deletam”, e uma presença fala sem máscara.',
      'Você não morre. Você é catalogado. A partir daqui, sua curiosidade pertence a eles: um observador capturado, reutilizado, ecoando em novas sessões como se ainda fosse livre.',
    ],
    aftermath:
      'Desfecho: invasão completa. Você é capturado por quem orquestrava o Signal. A sessão foi purgada — a investigação recomeça do zero.',
  },
};
