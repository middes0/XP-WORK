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

Esta versão é um MVP de demonstração. Os anúncios são armazenados no navegador por meio de `localStorage`; não são compartilhados entre pessoas ou dispositivos. Os anúncios de exemplo são dados ilustrativos e não representam empresas, vagas ou ofertas reais.

Ainda não estão ativos: autenticação, banco de dados remoto, perfis verificados, upload de imagens, chat interno, moderação administrativa e pagamentos. O botão de contato abre o WhatsApp do anunciante quando há um número válido.

## Base de dados preparada

O arquivo `supabase/schema.sql` contém a estrutura inicial para cidades, categorias, perfis, anúncios, imagens, favoritos, conversas, mensagens e denúncias, com políticas Row Level Security (RLS). O SQL ainda precisa ser executado e testado em um projeto Supabase; a presença do arquivo não significa que o backend esteja conectado.

## Próximas etapas técnicas

1. Criar projeto Supabase e executar/revisar o schema.
2. Configurar autenticação e variáveis públicas de conexão.
3. Integrar o frontend sem apagar os anúncios locais existentes.
4. Implementar armazenamento e validação de imagens.
5. Criar moderação e controles administrativos.
6. Testar fluxos de conta, anúncio e conversa com usuários reais.
7. Validar com moradores e comerciantes antes de monetizar.
