# XP WORK

Plataforma local para conectar moradores, profissionais, comércios e oportunidades. O primeiro lançamento tem foco em Xapuri, Acre, com estrutura pensada para expansão a outras cidades.

## Primeira versão (MVP)

- Interface responsiva mobile-first.
- Navegação: Início, Explorar, Anunciar, Mensagens e Perfil.
- Categorias: Serviços, Comércio, Classificados, Entregas, Empregos e Eventos.
- Busca e filtros locais.
- Cadastro e visualização de anúncios.
- Contato com anunciante via WhatsApp.
- Gerenciamento e exclusão dos próprios anúncios neste dispositivo.
- Manifesto PWA e cache offline básico.

## Como testar

Abra `index.html` em um navegador ou publique o repositório no Cloudflare Pages usando a raiz do projeto como diretório de saída. Para instalar como aplicativo e testar o service worker, use HTTPS.

## Limitações importantes desta versão

Os anúncios ficam no armazenamento local do navegador. Portanto, ainda não são compartilhados entre dispositivos ou usuários. Login, banco de dados remoto, upload de imagens, chat interno, moderação e pagamentos ainda não estão conectados. Os anúncios de exemplo são demonstrativos e não representam estabelecimentos ou vagas reais.

## Próximas etapas

1. Configurar Supabase (Auth, PostgreSQL, Storage e políticas RLS).
2. Migrar anúncios para o banco remoto.
3. Criar contas e perfis de moradores e empresas.
4. Implementar upload e moderação de imagens/anúncios.
5. Implementar chat e painel administrativo.
6. Validar com moradores e comerciantes de Xapuri.
