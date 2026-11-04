# 07 — Pesquisa com usuários

Objetivo: validar as **personas** e as **hipóteses de produto** antes de investir pesado no overlay e no host mode, e depois testar a usabilidade do overlay.

## 1. Plano de pesquisa

### Perguntas de pesquisa
1. Em que situações as pessoas compartilham tela com amigos ou colegas hoje, e com qual ferramenta?
2. O que incomoda nessas ferramentas durante o uso (janela ocupando espaço, troca de foco, áudio da tela, qualidade)?
3. Quanto um overlay sempre visível ajuda ou atrapalha? Onde ele deve ficar e o que precisa mostrar?
4. Quem estaria disposto a **hospedar** o servidor? O que trava essa pessoa (rede, roteador, PC ligado)?
5. Áudio só de um app é algo que as pessoas pedem espontaneamente ou só valorizam quando mostrado?

### Hipóteses a testar
| ID | Hipótese | Sinal de confirmação |
|---|---|---|
| H1 | Gamers mantêm o jogo em janela sem bordas (o overlay funciona) | ≥ 4 de 6 jogam assim ou aceitariam |
| H2 | Ver avatar + nome + quem fala basta no overlay; os controles podem ficar escondidos atrás de um clique | Nenhum participante pede controles sempre visíveis no teste |
| H3 | Compartilhar um app com o som dele é um diferencial percebido | Mencionado como dor espontaneamente ou avaliado ≥ 4/5 |
| H4 | O host aceita usar uma VPN mesh se o app guiar | ≥ metade dos potenciais hosts aceita |
| H5 | Paleta e layout estilo Discord reduzem a curva de aprendizado | Tarefas da janela principal concluídas sem ajuda |

### Métodos e cronograma
| Etapa | Método | Amostra | Quando |
|---|---|---|---|
| A | Entrevistas semiestruturadas | 5–8 (misturar gamers, estudantes e quem seria host) | Junto com a Fase 0 |
| B | Teste de usabilidade com protótipo navegável do overlay (Figma ou o próprio app da Fase 3) | 5–8 | Fim da Fase 3 |
| C | Teste de campo (beta fechado): um grupo usa por uma semana, com mini diário | 1–2 grupos de 3–5 | Fase 6 |
| D | Questionário curto pós-beta (SUS + 3 perguntas abertas) | todos os testadores | Fase 6 |

**Recrutamento:** colegas da faculdade (turma e grupos de estudo), amigos que jogam juntos e comunidades de jogos. Critério: compartilhou tela com alguém pelo menos uma vez no último mês.

**Ética:** pedir consentimento para gravar; anonimizar nas notas ("P1", "P2"…).

## 2. Roteiro de entrevista (≈ 50 min)

**Aquecimento (5 min)**
- Apresentação, objetivo ("entender como você usa chamadas e compartilhamento de tela, não testar você"), consentimento para gravar.
- O que você costuma fazer no computador com outras pessoas ao mesmo tempo?

**Contexto (10 min)**
- Conte a última vez que você compartilhou a tela com alguém. O que estava fazendo? Qual app usou?
- Como estava a tela: jogo, navegador, código? Em tela cheia ou em janela?
- Quem mais estava na chamada? Quanto tempo durou?

**Aprofundamento (20 min)**
- O que deu errado ou incomodou nessa vez? *(sondar: áudio, qualidade, achar a janela certa, eco, janela de chamada atrapalhando)*
- Quando está jogando ou focado, como você sabe quem está falando? Precisa olhar para a chamada?
- Já precisou compartilhar o som do que estava mostrando? Como fez? Funcionou?
- Já mostrou sem querer algo que não queria (notificação, outra janela)?
- *(potencial host)* Você deixaria um servidor rodando no seu PC para o grupo? O que te impediria? Já mexeu em roteador ou VPN?

**Reação (10 min)**: mostrar um mock do overlay (compacto e expandido) e o seletor de tela.
- O que você entende que é isso? O que você clicaria primeiro?
- Onde na tela você deixaria? O que tiraria ou colocaria?
- De 1 a 5, quanto "compartilhar só um app com o som dele" mudaria seu uso? Por quê?

**Encerramento (5 min)**
- Tem algo que não perguntei e que importa para você?
- Toparia testar uma versão beta? Agradecer.

## 3. Roteiro do teste de usabilidade do overlay

**Setup:** app (ou protótipo) com o overlay ativo, um jogo/vídeo em janela sem bordas e 2 participantes falsos (um falando, um transmitindo).

| # | Tarefa | Sucesso |
|---|---|---|
| T1 | "Descubra quem está falando agora." | Identifica pelo anel verde em ≤ 5 s |
| T2 | "Mute seu microfone." | Expande o overlay e muta, ou usa o atalho, sem ajuda |
| T3 | "Esconda o overlay e depois traga de volta." | Recolhe e reabre |
| T4 | "Mude o overlay para o outro lado da tela." | Arrasta pela alça |
| T5 | "Compartilhe só a janela do jogo, com o som dele." | Abre o seletor, aba Aplicativos, escolhe a janela, deixa áudio ligado, transmite (≤ 3 cliques após "Compartilhar") |
| T6 | "Assista à tela que a Ana está transmitindo e coloque em tela cheia." | Clica em AO VIVO → viewer → tela cheia |
| T7 | "Abaixe só o volume do Bruno." | Clique direito → slider |

**Medir:** sucesso/falha, tempo, erros, falar em voz alta (think-aloud) e SEQ (facilidade de 1 a 7) após cada tarefa.

## 4. Síntese

- **Mapa de afinidade:** cada observação num cartão (FigJam/Whiteboard), agrupada em temas (overlay, áudio, host, qualidade, confiança).
- **Matriz impacto × esforço** para priorizar o que entra no MVP e o que vai para o backlog.
- **Jornada:** "decidir jogar/estudar junto → entrar → conversar → mostrar a tela → encerrar", marcando os pontos de dor.
- **JTBD:** "Quando estou [jogando/estudando] com meu grupo, quero [falar e mostrar o que vejo sem sair do que estou fazendo], para [continuar focado e a conversa fluir]."

**Entregáveis:** relatório de síntese (temas, insights, recomendações) + highlight reel com citações. Com as transcrições, a skill `research-synthesis` pode montar o relatório.
