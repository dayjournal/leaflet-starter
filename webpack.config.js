const webpack = require("webpack");

module.exports = {
    mode: 'production',
    entry: './_resouce/main.js',
    output: {
        path: __dirname + '/dist',
        filename: 'app.js'
    },
    module: {
        rules: [
            {
                test: /\.css$/,
                loaders: ['style-loader', 'css-loader']
            },
            {
                test: /\.(png|svg|jpg|gif)$/,
                use: {
                    loader: 'url-loader',
                    options: {
                        name: './dist/img/icon/[name].[ext]'
                    }
                }
            }
        ]
    },
    plugins: [
        new webpack.ProvidePlugin({
            L: 'leaflet'
        })
    ],
    devServer: {
        contentBase: __dirname + '/dist',
        publicPath: '/',
        watchContentBase: true,
        open: true
    }
};

