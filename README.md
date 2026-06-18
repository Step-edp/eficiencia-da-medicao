# Eficiência da Medição

Aplicativo web inicial da área de Medição com interface moderna para login e solicitação de cadastro com aprovação administrativa.

## Funcionalidades iniciais

- Login com matrícula e senha.
- Cadastro com campos profissionais e pessoais.
- Aviso explícito de privacidade para informações pessoais.
- Estado visual de solicitação pendente de aprovação do ADM.
- Visual institucional com predominância de azul marinho.
- Link fixo para o formulário de Pedidos de Homologação da área de Compras.
- Cadastro local com aprovação do ADM antes da liberação de acesso.
- Perfil Compras restrito somente ao formulário de Pedidos de Homologação.
- Área de Gestão com aprovação local das solicitações pendentes.

## Campos do cadastro

- Nome completo
- Matrícula
- Data de nascimento
- E-mail corporativo
- Cargo
- CPF
- Senha e confirmação de senha
- Foto de perfil
- Fotos de pessoas que você ama
- Descrição pessoal
- Hobby

## Scripts

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run preview`

## Fluxo de Pedidos de Homologação

- Link fixo interno: ao abrir a rota com hash `#/compras/pedidos-homologacao`, o usuário cai no fluxo protegido do formulário.
- Se o usuário ainda não tiver cadastro, deve se cadastrar com perfil `Compras`.
- O cadastro fica com status pendente até aprovação do ADM na área de Gestão.
- Depois da aprovação, o perfil `Compras` passa a visualizar somente o formulário de Pedidos de Homologação.

## Status atual

Esta entrega contém o front-end do fluxo de autenticação, aprovação local do perfil Compras, compartilhamento do link fixo do formulário e registro local de pedidos de homologação. A integração com backend e autenticação segura em ambiente real continuam como próxima etapa.
