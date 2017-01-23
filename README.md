<div align="center"> 
  <a href="https://www.polymer-project.org">
    <img width="200" height="140" vspace="30"
    src="https://www.polymer-project.org/images/logos/p-logo.png">
  </a>
    <a href="http://webcomponents.org/">
    <img width="200" height="200"
      src="https://raw.githubusercontent.com/webcomponents/webcomponents-icons/master/logo/logo_512x512.png">
  </a>
  <a href="https://github.com/webpack/webpack">
    <img width="200" height="200" vspace="" hspace="25"
      src="https://worldvectorlogo.com/logos/webpack.svg">
  </a>
  <h1>WC Loader</h1>
  <p>Webcomponents webpack loader . Supports hot code reload.<p>
   <a href="https://www.npmjs.com/package/wc-loader">
    <img
      src="https://img.shields.io/npm/v/wc-loader.svg" height="20">
  </a>
     <a href="https://gitter.im/aruntk/polymer?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge">
    <img
      src="https://badges.gitter.im/aruntk/polymer.svg" height="20">
  </a>

   <a href="https://www.paypal.me/arunkumartk">
    <img
      src="https://dantheman827.github.io/images/donate-button.svg" height="20">
  </a>
<p> DEMO - <a href="https://github.com/aruntk/polymer-webpack-demo">https://github.com/aruntk/polymer-webpack-demo</a></p>
</div>


<h2 align="center">About</h2>

wc-loader helps you use webcomponents (polymer, x-tags etc also) with webpack.

### Under the hood

wc-loader uses [parse5](https://github.com/inikulin/parse5) which parses HTML the way the latest version of your browser does. 
Does not use any regex to parse html. :)

#####Main functions

1. Handles html link imports. **With Hot Code Reload Support**
2. Handles external script files (script src). **With Hot Code Reload Support**
3. Handles external css files (link rel stylesheet)
4. Handles template tags.
5. Removes comments and unecessary whitespaces.
5. Handles loading order of html and js inside the polymer files
4. Adds components to document during runtime.

<h2 align="center">Installation</h2>

```sh
npm i -D wc-loader
```

<h2 align="center">Usage</h2>

```js
module: {
  loaders: [
    {
      test: /\.html$/, // handles html files. <link rel="import" href="path.html"> and import 'path.html';
      loader: 'wc-loader' 
      // if you are using es6 inside html use 
      // loader: 'babel-loader!wc-loader'
      // similarly you can use coffee, typescript etc. pipe wc result through the respective loader.
    },
    {
      test: /\.js$/, // handles js files. <script src="path.js"></script> and import 'path';
      loader: 'babel-loader',
      exclude: /node_modules/
    },
    {
      test: /\.(png|jpg|gif|svg)$/, // handles assets. eg <img src="path.png">
      loader: 'file-loader',
      query: {
        name: '[name].[ext]?[hash]'
      }
    },
  ]
}
```
### Using es6, typescript, coffee etc inside html

if you are using es6 inside html use 
```js
loader: 'babel-loader!wc-loader'
```
similarly you can use coffee, typescript etc. pipe wc result through the respective loader.
```js
loader: 'ts-loader!wc-loader'
```
```js
loader: 'coffee-loader!wc-loader'
```

### Like it?

:star: this repo


### Found a bug?

Raise an issue!

### License

MIT. Check [licence](licence) file.
