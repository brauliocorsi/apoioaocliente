

## Plano: Redesign visual minimalista + Verificação Resend

### Diagnóstico

**Página em branco/imagem partida:** O problema que vê ao abrir o sistema parece ser um problema de cache do preview. A aplicação carrega corretamente (testei e aparece a página de login). Vou garantir que o CSS e layout estejam robustos para evitar este tipo de problema.

**Resend:** Já está ativo (`resend_enabled = true`, `resend_from_email = noreply@upmoveis.pt`). O IMAP também está ativo (`imap_enabled = true`, `imap_host = mail.upmoveis.pt`). Os emails de envio saem pelo Resend e a receção está configurada via IMAP.

---

### Alterações visuais

#### 1. Paleta de cores refinada (index.css)
- Light mode: fundo mais branco/limpo (`0 0% 100%` para background), tons neutros mais suaves
- Sidebar: fundo escuro elegante com tom slate/charcoal mais moderno (não tão escuro)
- Primary: manter o azul mas com tom mais sofisticado
- Bordas mais subtis, sombras mais leves

#### 2. Tipografia mais moderna (index.css)
- Importar fonte **Inter** via Google Fonts no `index.html`
- Aumentar levemente o letter-spacing em headings
- Font-weight mais refinado nos textos

#### 3. Sidebar estilizada (AppSidebar.tsx)
- Remover gradientes excessivos nos ícones ativos
- Indicador ativo mais subtil (barra lateral fina + fundo suave)
- Ícones monocromáticos, sem caixas/background nos ícones
- Espaçamento mais generoso entre items
- Footer do perfil mais clean
- Logo com melhor apresentação

#### 4. Header mais limpo (AppLayout.tsx)
- Header mais fino e discreto
- Sem efeito glass (fundo sólido)
- Separação mais subtil

#### 5. Página de Login mais elegante (Auth.tsx)
- Background com gradiente subtil
- Card com sombra mais pronunciada
- Logo da empresa em vez do ícone genérico

#### 6. Cards e componentes globais
- Border-radius ligeiramente maior (`0.75rem`)
- Sombras mais suaves
- Hover states mais discretos

---

### Ficheiros a alterar

| Ficheiro | Alteração |
|---|---|
| `index.html` | Adicionar import da fonte Inter |
| `src/index.css` | Nova paleta de cores, tipografia, utilitários |
| `src/components/AppSidebar.tsx` | Redesign minimalista da sidebar |
| `src/components/AppLayout.tsx` | Header mais limpo |
| `src/pages/Auth.tsx` | Login page redesenhada |
| `tailwind.config.ts` | Ajustar border-radius |

Nenhuma alteração de backend necessária. O Resend e IMAP já estão ativos e funcionais.

