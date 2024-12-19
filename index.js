require("dotenv").config();
const Telegraf = require("telegraf");
const Markup = require("telegraf/markup");
const Extra = require("telegraf/extra");
const session = require('telegraf/session');
const Stage = require('telegraf/stage');
const Composer = require('telegraf/composer');
const WizardScene = require('telegraf/scenes/wizard');
const moment = require('moment');
const express = require('express');

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());

const insetos = ["Larvas de Tenébrio Molitor", "Larvas de Tenébrio Gigante", "Grilo Negro"];
const qtde = [
    ['10', '25', '50'],
    ['100', '250', '500'],
    ['1000']
];
const enviarOuColetar = ['Enviar', 'Coletar'];
const local = ['Águas Claras', 'Vicente Pires'];

const menu = Extra.markup(Markup.inlineKeyboard([
    Markup.callbackButton('📋 Criar pedido', 'criarPedido'),
    Markup.callbackButton('👀 Ver pedidos', 'verPedidos'),
    Markup.callbackButton('📝 Editar pedidos', 'editarPedidos'),
    Markup.callbackButton('✅ Finalizar ordens de pedidos', 'finalizarDia'),
], { columns: 2 }));


const simOuNao = Extra.markup(Markup.inlineKeyboard([
    Markup.callbackButton('Sim', 's'),
    Markup.callbackButton('Não', 'n'),
], { columns: 2 }));

// Middleware para injetar informações no contexto (ctx)
bot.use((ctx, next) => {
    const pedidos = ctx.session.pedidos;
    const id = pedidos?.length - 1

    ctx.pedido = () => {
        return pedidos[id]
    };

    ctx.insetos = () => {
        return pedidos[id].insetos
    }

    ctx.inseto = () => {
        const insetoId = pedidos[id].insetos.length - 1
        const inseto = pedidos[id].insetos[insetoId]
        return inseto
    }

    // Chama a próxima função no middleware
    return next();
});

const nomeClienteHandler = new Composer();
nomeClienteHandler.on('text', ctx => {
    ctx.pedido().cliente = ctx.update.message.text;
    ctx.pedido().insetos = [];
    ctx.scene.leave();
    ctx.scene.enter('item do pedido');
    ctx.wizard.next()
})

const insetosHandler = new Composer();
insetosHandler.hears(insetos, ctx => {
    ctx.insetos().push({ nomeDoInseto: ctx.update.message.text });
    ctx.reply("Quantas unidades deseja?", Markup.keyboard(qtde).resize().oneTime().extra());
    ctx.wizard.next();
});
insetosHandler.use(ctx => ctx.reply('Favor informar um dos insetos disponíveis na lista'));

const quantidadeHandler = new Composer();
quantidadeHandler.hears(/(\d+)/, async ctx => {
    ctx.inseto().unidades = +ctx.match[1];
    ctx.reply(`Adicionar mais insetos ao pedido do(a) ${ctx.pedido().cliente} ?`, simOuNao);
    ctx.wizard.next();
});
quantidadeHandler.use(ctx => ctx.reply('Informe a quantidade corretamente'));

const maisInsetos = new Composer();
maisInsetos.action('s', ctx => {
    ctx.scene.enter('item do pedido');
    ctx.wizard.next();
});
maisInsetos.action('n', ctx => {
    ctx.scene.leave();
    ctx.scene.enter('finalizar pedido');
    ctx.wizard.next();
});
maisInsetos.use(ctx => ctx.reply('Adicionar mais insetos a esse pedido?', simOuNao));

const coletaOuEnvioHandler = new Composer();
coletaOuEnvioHandler.hears(enviarOuColetar, ctx => {
    ctx.pedido().envioOuColeta = ctx.update.message.text;
    if (ctx.pedido().envioOuColeta === 'Enviar') {
        ctx.reply('De qual local será feito o envio?', Markup.keyboard(local).resize().oneTime().extra());
    } else {
        ctx.reply('Qual o local para coleta?', Markup.keyboard(local).resize().oneTime().extra());
    }
    ctx.wizard.next();
});
coletaOuEnvioHandler.use(ctx => ctx.reply("Escolha entre \"Coletar\" ou \"Enviar\""));

const localHandler = new Composer();
localHandler.hears(local, ctx => {
    ctx.pedido().local = ctx.update.message.text;
    ctx.reply(`Qual a data de ${ctx.pedido().envioOuColeta}? Use o formato DD/MM/AAAA`);
    ctx.wizard.next();
});
localHandler.use(ctx => ctx.reply('Selecione um dos endereços disponíveis.'));

const dataHandler = new Composer();
dataHandler.hears(/(\d{2}\/\d{2}\/\d{4})/, ctx => {
    moment.locale('pt-BR')
    ctx.pedido().data = moment(ctx.match[1], 'DD/MM/YYYY')
    ctx.replyWithHTML(`Pedido cliente <b>${ctx.pedido().cliente}</b> finalizado.`, Markup.removeKeyboard());
    ctx.scene.leave();
    ctx.wizard.next();
})

const wizardIniciarPedido = new WizardScene('iniciar pedido',
    async ctx => {
        await ctx.reply("Qual o nome do cliente?")
        ctx.wizard.next();
    },
    nomeClienteHandler,
    insetosHandler,
    quantidadeHandler,
    maisInsetos,
);

const wizardPedido = new WizardScene('item do pedido',
    async ctx => {
        ctx.reply('Qual o inseto do pedido?', Markup.keyboard(insetos).resize().oneTime().extra());
        ctx.wizard.next();
    },
    insetosHandler,
    quantidadeHandler,
    maisInsetos,
);

const wizardFinalizarPedido = new WizardScene('finalizar pedido',
    ctx => {
        ctx.reply('Pedido para envio ou coleta?', Markup.keyboard(enviarOuColetar).resize().oneTime().extra());
        ctx.wizard.next();
    },
    coletaOuEnvioHandler,
    localHandler,
    dataHandler,
)

const stage = new Stage([wizardIniciarPedido, wizardPedido, wizardFinalizarPedido]);
bot.use(stage.middleware());

bot.start(ctx => {
    if (!ctx.session.pedidos) ctx.session.pedidos = [];
    const name = ctx.update.message.from.first_name
    ctx.reply(`Seja bem vindo, ${name}! Como posso ajudar?`, menu);
});

bot.command('options', ctx => {
    if (!ctx.session.pedidos) ctx.session.pedidos = [];
    ctx.reply('Opções', menu);
})

bot.action('criarPedido', async ctx => {
    if (!ctx.session.pedidos) ctx.session.pedidos = [];
    const pedidos = ctx.session.pedidos;
    const id = pedidos.length
    pedidos[id] = {};
    await ctx.replyWithHTML('<b>***** INICIADO ORDEM DE PEDIDO *****</b>');
    // Stage.enter('item do pedido');
    ctx.scene.enter('iniciar pedido');
});

bot.action('editarPedidos', ctx => {
    const pedidos = ctx.session.pedidos
    if (pedidos == undefined) {
        ctx.reply('Não existem pedidos.')
        return
    }

    const pedidosParaEdicao = () => Extra.markup(
        Markup.inlineKeyboard(
            pedidos.map(pedido => {
                return Markup.callbackButton(pedido.cliente, `editar_${pedido.cliente}`)
            }), { columns: 3 }));

    ctx.reply('Escolha um pedido', pedidosParaEdicao())

})

bot.action(/^editar_(.+)/, async ctx => {
    const clienteSelecionado = ctx.match[1]
    const pedido = ctx.session.pedidos.find(p => p.cliente === clienteSelecionado)
    console.log('pedido', pedido)
})

bot.action('verPedidos', ctx => {
    const pedidos = ctx.session.pedidos
    if (pedidos == undefined || !pedidos || pedidos.length <= 0) {
        ctx.reply('Não existem pedidos.')
        return
    }
    pedidos.forEach(async (pedido, index) => {
        let pedidoHTML = `<b>PEDIDO Nº ${index + 1}:</b>\n  Cliente: <i>${pedido.cliente}</i>\n`
        pedido.insetos.forEach(inseto => {
            pedidoHTML += `    - ${inseto.nomeDoInseto}, ${inseto.unidades} unidades \n`
        });
        pedidoHTML += `<i>${pedido.envioOuColeta}</i> | <i>${pedido.local}</i> | <i>${pedido.data.format('DD/MM/YYYY')}</i>`

        await ctx.replyWithHTML(pedidoHTML);
    })

})

bot.action('finalizarDia', ctx => {
    const pedidos = ctx.session.pedidos
    if (pedidos == undefined || !pedidos || pedidos.length <= 0) {
        ctx.reply('Não existem pedidos.')
        return
    }
    console.log('pedidos', pedidos)
    // Lógica para montar o pedido em HTML
    pedidos.forEach(async (pedido, index) => {
        let pedidoHTML = `<b>PEDIDO Nº ${index + 1}:</b>\n  Cliente: <i>${pedido.cliente}</i>\n`
        pedido.insetos.forEach(inseto => {
            pedidoHTML += `    - ${inseto.nomeDoInseto}, ${inseto.unidades} unidades \n`
        });
        pedidoHTML += `<i>${pedido.envioOuColeta}</i> | <i>${pedido.local}</i> | <i>${pedido.data.format('DD/MM/YYYY')}</i>`
        const grupoId = '-4171648692'; // Substitua pelo ID real do grupo
        // Envia o pedido ao grupo específico
        const message = await ctx.telegram.sendMessage(grupoId, pedidoHTML, { parse_mode: 'HTML' });
        // Fixar a mensagem no grupo
        await ctx.telegram.pinChatMessage(grupoId, message.message_id);
    })
})

bot.startPolling();