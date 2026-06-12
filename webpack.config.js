const path              = require('path')
const HtmlWebpackPlugin = require( 'html-webpack-plugin' ) // allows generate an 'index.html' file automatically which will include a reference to the ONE single-bundled file
const webpack           = require('webpack')
const fs                = require('fs')


const envContent = fs.readFileSync('./config/env.yaml', 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading file:', err)
    return
  }
});

const envVariables = () => {
  const lines = envContent.split('\n')
  return lines.reduce((prev, curr) => {
    const [key, value] = curr.split(': ')

    return { ...prev, [key]: value.replace(`\r`, '') }
  }, {})
}

module.exports = [
  {
    entry: {
      index: './src/app/index.tsx', // entrypoint/main root file of application
    },
    mode: 'development', // mode for building the code; other option is 'production' for deployment
    target: 'web',  // tells it to run on web browser; other option is 'node' to handle node application on server side
    devServer: {
      host: process.env.HOST || 'localhost',
      port: process.env.PORT || 8080,
      server: 'https',
      historyApiFallback: true,
    },
    output: {
      // - How to handle the files
      // - where to output the bundled file
      path: path.resolve(__dirname, 'dist/app'), // creates directory
      filename: '[name]-chunk.bundle.js' // all of the code generated in ONE bundle
    },
    resolve: {
      extensions: ['.js', '.ts', '.tsx', '.jsx'],
      alias: {
          publicCss: path.resolve(__dirname, 'public'),
          stylesMain: path.resolve(__dirname, 'src/styles/main'),
          stylesButtons: path.resolve(__dirname, 'src/styles/buttons'),
          Content: path.resolve(__dirname, 'src/components/content'),
          Navigation: path.resolve(__dirname, 'src/components/navigation')
      }
    },
    module: {
      // --- Loaders ---
      // - tells what transformations before creating the single file
      // - allows to tell 'webpack' how to INTERPRET and TRANSLATE 'non-javascript'/all files after it has been resolved
      // - returns COMPILATIONS; returns NEW SOURCES
      rules: [  // sets rules
        {
          // - this tells whenever it encounters files with these extensions
          // - then it will use the loader that will deal with these files
          test: /\.(ts|tsx)$/,
          exclude: /node_modules/,
          use: 'ts-loader'  // deals with files with .ts|.tsx extensions
        },
        {
          test: /\.(js|jsx)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                '@babel/present-env',
                '@babel/present-react',
                '@babel/present-typescript'
              ]
            }
          }
        },
        {
          test: /\.(css|scss)$/,
          exclude: /node_modules/,
          use: [
              'style-loader',
              'css-loader',
              'sass-loader'
          ]
        }, // transforms any single CSS file with CSS 'require' syntax; and takes required CSS which injects it into the page to make it active
        {
          test: /\.(png|svg|jpg|gif|ttf)$/i, 
          type: 'asset/resource'
        }
      ]
    },
    plugins: [
      // - is an ES5 'class' w/c implements an "APPLY" function
      // - compiler uses it to 'emit' EVENTS
      // - 'adds' additional functionality to "webpack's event lifecycle"
      new HtmlWebpackPlugin( { // instance
          template: './public/index.html',
          filename: './index.html'
      }),
      new webpack.ProvidePlugin({
        process: 'process/browser.js',
      }),
      // new webpack.DefinePlugin(['NODE_ENV'])
      new webpack.DefinePlugin({
        // 'process.env': JSON.stringify(envVariables)
        'process.env': JSON.stringify(envVariables())
      })
    ]
  }
]