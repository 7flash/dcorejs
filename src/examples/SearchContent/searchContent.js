"use strict";

document.getElementById('searchButton').onclick = () => {
    const keyword = document.getElementById('keyword').value;
    searchContent(keyword);
};

const chainId = '17401602b201b3c45a3ad98afc6fb458f91f519bd30d1058adf6f2bed66376bc';
const decentNetworkAddresses = ['wss://stage.decentgo.com:8090'];

decent.Decent.initialize({
    chain_id: chainId,
    decent_network_wspaths: decentNetworkAddresses
});

const output = document.getElementById('output');

function searchContent(keyword) {
    console.log(keyword);
    output.innerHTML = 'Loading ...';
    decent.Decent.core.content.searchContent(new decent.SearchParams(keyword))
        .then(content => {
            const data = renderContent(content);
            output.innerHTML = data;
        })
        .catch(err => {
            console.error(err);
            output.innerHTML = 'Error loading content';
        });
}

function renderContent(content) {
    let render = '<ul>';
     render += content.map(c => '<li>' + c.synopsis.title + '</li>');
     render += '</ul>';
     return render
}
//# sourceMappingURL=searchContent.js.map