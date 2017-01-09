/*
  MIT License http://www.opensource.org/licenses/mit-license.php
  Author Arun Kumar T K @aruntk
  */
import loaderUtils from 'loader-utils';
import SourceMap from 'source-map';
import parse5 from 'parse5';
import polyclean from 'polyclean';
import fs from 'fs';
import url from 'url';
import path from 'path';
import * as _ from 'lodash';
import * as Babel from 'babel-core';
import assign from 'object-assign';
import Synthesizer from './synthesis-gen.js';

class DissectHtml {
  constructor(config) {
    this.config = config;
    this.dissected = {
      js: '//*synthesis*//\n',
      tailJs: '', // tailJs is appended last
    };
  }
  dissect(contents, sourcePath) {
    this.document = contents;
    this.path = sourcePath;
    const self = this;
    const children = this.document.childNodes || [];
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      switch (child.nodeName) {
        case '#documentType':
          break;
        case '#comment':
          break;
        case 'html': {
          const _children = child.childNodes || [];
          for (let _i = 0; _i < _children.length; _i += 1) {
            const _child = _children[_i];
            switch (_child.nodeName) {
              case 'head': {
                _child.childNodes = self.processChildNodes(_child.childNodes);
                const headContents = parse5.serialize(_child);
                // for files inside client folder html contents can be
                // directly added to dissected.html
                self.dissected.js += `\n${Synthesizer.generateJS(headContents, true)}\n`;
              }
                break;
              case 'body': {
                const body = _child;
                body.childNodes = self.processChildNodes(body.childNodes);
                const bodyContents = parse5.serialize(body);
                self.dissected.js += `\n${Synthesizer.generateJS(bodyContents)}\n`;
              }
                break;
              default:
                break;
            }
          }
        }
          break;
        default:
          break;
      }
    }
    this.dissected.js += `\n${this.dissected.tailJs}\n`;
  }
  processChildNodes(childNodes) {
    const self = this;
    let pushNodes = [];
    const processedNodes = _.compact(_.map(childNodes, (child) => {
      switch (child.nodeName) {
        case 'template': {
          const template = child;
          const tmContent = template.content;
          const isWalkable = tmContent && tmContent.nodeName === '#document-fragment' && tmContent.childNodes;
          if (isWalkable) {
            tmContent.childNodes = self.processChildNodes(tmContent.childNodes);
          }
          template.content = tmContent;
          return template;
        }
        case 'link': {
          const processedLinkChild = self.processLinks(child);
          if (processedLinkChild) {
            return processedLinkChild;
          }
        }
          break;
        case 'script': {
          const result = self.processScripts(child);
          if (result) {
            return result;
          }
        }
          break;
        case 'style': {
          if (child.childNodes && child.childNodes.length) {
            const childNode = child.childNodes[0];
            const css = childNode.value;
            const result = self.processStyle(css);
            if (result) {
              childNode.value = result;
            }
          }
          return child;
        }
        case 'dom-module': {
          const domModule = child;
          if (domModule.childNodes) {
            domModule.childNodes = self.processChildNodes(domModule.childNodes);
          }
          return domModule;
        }
        case 'div': {
          const divChild = child;
          const attrs = _.filter(divChild.attrs, o => (o.name === 'hidden' || o.name === 'by-vulcanize'));
          if (attrs.length >= 2) {
            const _childNodes = self.processChildNodes(divChild.childNodes);
            pushNodes = pushNodes.concat(_childNodes);
          } else {
            if (divChild.childNodes) {
              divChild.childNodes = self.processChildNodes(divChild.childNodes);
            }
            return divChild;
          }
        }
          break;
        case '#comment':
          break;

        default: {
          const defChild = child;
          const attrs = _.map(defChild.attrs, (o) => {
            // all src values without [[*]] and {{*}}
            if (o.name === 'src' || o.name === 'src$') {
              o.value = self._changeRelUrl(o.value);
            }
            return o;
          });
          defChild.attrs = attrs;
          if (defChild.childNodes) {
            defChild.childNodes = self.processChildNodes(defChild.childNodes);
          }
          return defChild;
        }
      }
      return null;
    }));
    return processedNodes.concat(pushNodes);
  }
  processStyle(css) {
    return polyclean.stripCss(css);
  }
  processScripts(child) {
    const self = this;
    const importSource = _.find(child.attrs, v => (v.name === 'src'));
    if (importSource && importSource.value) {
      const importableUrl = self.importableUrl(importSource.value);
      if (!importableUrl) {
        return child;
      }
      self.dissected.tailJs += `\nrequire('${importableUrl}');\n`;
    } else {
      self.dissected.tailJs += `\n${self.babelJs(parse5.serialize(child))}\n`;
    }
    return null;
  }
  babelJs(js) {
    // const prod = process.env.NODE_ENV ==='production';
    return Babel.transform(js).code;
  }

  importableUrl(link) {
    const root = this.config.root;
    if(!loaderUtils.isUrlRequest(link, root)) return;
    const uri = url.parse(link);
    if (uri.hash !== null && uri.hash !== undefined) {
      uri.hash = null;
      link = uri.format();
    }
    return loaderUtils.urlToRequest(link);
  }
  processLinks(child) {
    const self = this;
    // <link rel='import'...> and <link rel='stylesheet'...>
    const supportedRels = ['import', 'stylesheet'];
    const ifImport = _.find(child.attrs, v => (v.name === 'rel' && supportedRels.indexOf(v.value) > -1));
    if (ifImport) {
      const hrefAttr = _.find(child.attrs, v => v.name === 'href');
      if (hrefAttr) {
        if (hrefAttr.value) {
          switch (ifImport.value) {
            case 'import': {
              // file is imported using require
              const link = self.importableUrl(hrefAttr.value);
              if (!link) {
                return child;
              }
              const typeAttr = _.find(child.attrs, v => (v.name === 'type'));
              if (typeAttr) {
                switch (typeAttr.value) {
                  case 'css':
                    return self.processCssImport(hrefAttr, child);
                  default:
                    break;
                }
              }
              const importable = `require('${link}');`;
              self.dissected.tailJs += `\n${importable}\n`;
            }
              break;
              // Processing <link rel='stylesheet' href='filename.css'>
            case 'stylesheet':
              // absolute file path
              return self.processCssImport(hrefAttr, child);
            default:
              break;
          }
        }
      } else {
        return child;
      }
    } else {
      return child;
    }
    return null;
  }
  _changeRelUrl(inpUrl, basePath) {

    // avoids var(--url-variable) and bound properties [[prop]] and {{prop}};
    if (inpUrl && !inpUrl.match(/var\(.*?\)|({{|\[\[)\s*[\w\.]+\s*(}}|\]\])/ig)) {
      // avoids absolute & remote urls
      const link = this.importableUrl(inpUrl);
      console.log(link);
      if (link) {
        return path.resolve(path.dirname((basePath || `/${this.sourceName}`)), inpUrl);
      }
    }
    return inpUrl;

  }
  _changeCssUrls(text, cssBasePath) {
    const self = this;
    // to get -> property: url(filepath)

    const processed = text.replace(/url\(['|"]?([^)]+?)['|"]?\)/ig, function(_u, link) {
      // to get -> filepath from url(filepath), url('filepath') and url("filepath")
      return `url(${self._changeRelUrl(link, cssBasePath)})`;
    });
    return processed;
  }

  processCssImport(hrefAttr, child) {
    const link = path.resolve(this.path, '../', hrefAttr.value);
    // checks if file exists
    if (fs.existsSync(link)) {
      const contents = fs.readFileSync(link, 'utf8');
      // css is inlined
      const minified = this.processStyle(contents);
      if (minified) {
        // link tag is replaced with style tag
        return _.extend(child, {
          nodeName: 'style',
          tagName: 'style',
          attrs: [],
          childNodes: [
            {
              nodeName: '#text',
              value: minified,
            },
          ],
        });
      }
    }
    return child;
  }
}

function randomIdent() {
  return "xxxWCLINKxxx" + Math.random() + Math.random() + "xxx";
}

function getLoaderConfig(context) {
  const query = loaderUtils.parseQuery(context.query);
  const configKey = query.config || 'wcLoader';
  const config = context.options && context.options.hasOwnProperty(configKey) ? context.options[configKey] : {};

  delete query.config;

  return assign(query, config);
}
module.exports = function (source, sourceMap) {
  // const query = loaderUtils.parseQuery(this.query);

  if (this.cacheable) {
    this.cacheable();
  }
  const config = getLoaderConfig(this);
  let attributes = ['img:src'];
  if(config.attrs !== undefined) {
    if(typeof config.attrs === 'string')
      attributes = config.attrs.split(' ');
    else if(Array.isArray(config.attrs))
      attributes = config.attrs;
    else if(config.attrs === false)
      attributes = [];
    else
      throw new Error('Invalid value to config parameter attrs');
  }
  const root = config.root;
  // /foo/bar/file.js
  const srcFilepath = this.resourcePath;
  // /foo/bar/file.js -> file
  // const srcFilename = path.basename(srcFilepath, path.extname(srcFilepath));
  // /foo/bar/file.js -> /foo/bar
  // const srcDirpath  = path.dirname(srcFilepath);
  // /foo/bar -> bar
  // const srcDirname  = srcDirpath.split(path.sep).pop();
  const parsed = parse5.parse(source);
  const dissectFn = new DissectHtml(config);
  dissectFn.dissect(parsed, srcFilepath);
  const inject = dissectFn.dissected.js;
  if (sourceMap) {
    const currentRequest = loaderUtils.getCurrentRequest(this);
    const SourceNode = SourceMap.SourceNode;
    const SourceMapConsumer = SourceMap.SourceMapConsumer;
    const sourceMapConsumer = new SourceMapConsumer(sourceMap);
    const node = SourceNode.fromStringWithSourceMap(source, sourceMapConsumer);

    node.prepend(inject);

    const result = node.toStringWithSourceMap({
      file: currentRequest,
    });

    this.callback(null, result.code, result.map.toJSON());

    return;
  }

  // prepend collected inject at the top of file
  return inject;
};
