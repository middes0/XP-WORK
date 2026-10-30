# XP WORK

Plataforma local para conectar moradores, profissionais, comércios e oportunidades. O lançamento inicial tem foco em Xapuri, Acre, com arquitetura preparada para expansão a outras cidades.

## Direção do produto

- Interface mobile-first, clara e acessível.
- Identidade visual institucional com azul, branco, cinza e verde de confirmação.
- Navegação principal: Início, Explorar, Anunciar, Mensagens e Perfil.
- Categorias: Serviços, Comércio, Classificados, Entregas, Empregos e Eventos.
- Busca, filtros e contato direto com anunciantes.
- Experiência PWA com cache básico para acesso offline.

## Publicar no Cloudflare Pages

- Conecte este repositório ao Cloudflare Pages.
- Use a branch `main`.
- Como é um projeto estático, deixe o comando de build vazio.
- Defina a raiz do projeto como diretório de saída.

## Estado atual e limitações

O frontend possui integração inicial com Supabase: cadastro/login por e-mail, perfil básico e leitura/publicação/exclusão de anúncios compartilhados. A conexão usa somente URL e chave publishable no navegador; nenhuma chave secreta é necessária no frontend.

Os anúncios antigos salvos em `localStorage` são preservados neste aparelho, mas não são enviados automaticamente para o banco. Os anúncios de demonstração são ilustrativos. Upload de imagens, chat interno, moderação administrativa e pagamentos ainda não estão ativos. A integração precisa ser testada no projeto Supabase real antes de ser considerada pronta para produção.

## Base de dados

O arquivo `supabase/schema.sql` define cidades, categorias, perfis, anúncios, imagens, favoritos, conversas, mensagens e denúncias, com políticas Row Level Security (RLS). O schema foi executado pelo proprietário do projeto, conforme confirmação na conversa. A revisão de segurança e os testes de permissões ainda são necessários.

## Próximas etapas

1. Testar cadastro, confirmação de e-mail e login.
2. Testar anúncios entre duas contas e dispositivos.
3. Revisar políticas RLS e configurar Storage com políticas seguras.
4. Implementar imagens, chat interno e moderação.
5. Validar com moradores e comerciantes antes de monetizar.
