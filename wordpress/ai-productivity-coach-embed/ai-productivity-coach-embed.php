<?php
/**
 * Plugin Name: AI Productivity Coach Embed
 * Description: Embeds the EY-ERIC productivity coach and public provider experience in WordPress via shortcodes.
 * Version: 1.1.2
 * Author: Zain
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Original productivity-coach shortcode.
 *
 * Kept backward-compatible so existing WordPress pages continue to work.
 */
function apc_embed_shortcode($atts) {
    $atts = shortcode_atts(array(
        'url' => 'https://ai-productivity-coach-zeta.vercel.app/embed',
        'height' => '900',
        'radius' => '18',
    ), $atts, 'ai_productivity_coach');

    $url = esc_url($atts['url']);
    $height = max(320, intval($atts['height']));
    $radius = max(0, intval($atts['radius']));

    ob_start();
    ?>
    <div class="apc-embed-wrapper" style="width:100%; max-width:1240px; margin:0 auto;">
        <iframe
            class="apc-embed-frame"
            src="<?php echo esc_url($url); ?>"
            title="<?php echo esc_attr__('EY-ERIC AI Productivity Coach', 'ai-productivity-coach-embed'); ?>"
            loading="lazy"
            allow="clipboard-write; fullscreen"
            referrerpolicy="strict-origin-when-cross-origin"
            style="width:100%; height:<?php echo esc_attr($height); ?>px; border:1px solid #e5e7eb; border-radius:<?php echo esc_attr($radius); ?>px; background:#ffffff; display:block; overflow:hidden;"
        ></iframe>
    </div>
    <style>
        @media (max-width: 768px) {
            .apc-embed-frame {
                height: 980px !important;
                border-radius: 14px !important;
            }
        }
    </style>
    <?php
    return ob_get_clean();
}
add_shortcode('ai_productivity_coach', 'apc_embed_shortcode');

/**
 * Build the origin expected by the parent-side postMessage receiver.
 */
function apc_provider_embed_origin($url) {
    $parts = wp_parse_url($url);

    if (!$parts || empty($parts['scheme']) || empty($parts['host'])) {
        return '';
    }

    $origin = $parts['scheme'] . '://' . $parts['host'];

    if (!empty($parts['port'])) {
        $origin .= ':' . intval($parts['port']);
    }

    return $origin;
}

/**
 * Public providers shortcode.
 *
 * Example: [ey_eric_providers]
 * Optional: [ey_eric_providers lang="en" height="1000" radius="12"]
 */
function apc_providers_embed_shortcode($atts) {
    $default_url = 'https://ai-productivity-coach-zeta.vercel.app/providers';
    $atts = shortcode_atts(array(
        'url' => $default_url,
        'height' => '900',
        'min_height' => '480',
        'max_height' => '40000',
        'radius' => '0',
        'lang' => 'de',
        'title' => 'EY-ERIC Anbieterprofile',
    ), $atts, 'ey_eric_providers');

    $base_url = esc_url_raw($atts['url']);
    $url_parts = wp_parse_url($base_url);
    $url_path = isset($url_parts['path']) ? $url_parts['path'] : '';

    // This embed is intentionally limited to the public provider route tree.
    if (!$url_parts || empty($url_parts['scheme']) || empty($url_parts['host']) || strpos($url_path, '/providers') !== 0) {
        $base_url = $default_url;
    }

    $language = strtolower(sanitize_key($atts['lang'])) === 'en' ? 'en' : 'de';
    $src = add_query_arg(array(
        'embed' => 'wordpress',
        'lang' => $language,
    ), $base_url);

    $origin = apc_provider_embed_origin($src);
    $height = max(320, intval($atts['height']));
    $min_height = max(320, intval($atts['min_height']));
    $max_height = max($min_height, min(60000, intval($atts['max_height'])));
    $radius = max(0, min(80, intval($atts['radius'])));
    $title = sanitize_text_field($atts['title']);

    if ($title === '') {
        $title = $language === 'de' ? 'EY-ERIC Anbieterprofile' : 'EY-ERIC Provider Profiles';
    }

    $frame_id = function_exists('wp_unique_id')
        ? wp_unique_id('ey-eric-providers-')
        : uniqid('ey-eric-providers-', false);

    ob_start();
    ?>
    <div
        class="ey-eric-providers-embed"
        data-ey-eric-providers
        data-origin="<?php echo esc_attr($origin); ?>"
        data-min-height="<?php echo esc_attr($min_height); ?>"
        data-max-height="<?php echo esc_attr($max_height); ?>"
        style="--ey-eric-provider-radius:<?php echo esc_attr($radius); ?>px;"
    >
        <iframe
            id="<?php echo esc_attr($frame_id); ?>"
            class="ey-eric-providers-frame"
            src="<?php echo esc_url($src); ?>"
            title="<?php echo esc_attr($title); ?>"
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            referrerpolicy="strict-origin-when-cross-origin"
            style="height:<?php echo esc_attr($height); ?>px;"
        ></iframe>
        <noscript>
            <p>
                <a href="<?php echo esc_url($base_url); ?>" target="_blank" rel="noopener noreferrer">
                    <?php echo esc_html($title); ?>
                </a>
            </p>
        </noscript>
    </div>
    <?php

    static $assets_printed = false;

    if (!$assets_printed) {
        $assets_printed = true;
        ?>
        <style>
            .ey-eric-providers-embed {
                width: 100%;
                max-width: 100%;
                margin: 0 auto;
                overflow: hidden;
                border-radius: var(--ey-eric-provider-radius, 0);
                background: #f5f6f8;
            }

            .ey-eric-providers-frame {
                display: block;
                width: 100%;
                max-width: 100%;
                border: 0;
                border-radius: inherit;
                background: #f5f6f8;
                overflow: hidden;
                transition: height 160ms ease;
            }

            @media (prefers-reduced-motion: reduce) {
                .ey-eric-providers-frame {
                    transition: none;
                }
            }
        </style>
        <script>
            (function () {
                if (window.__eyEricProvidersEmbedReady) return;
                window.__eyEricProvidersEmbedReady = true;

                var supportedTypes = {
                    'ey-eric-providers:ready': true,
                    'ey-eric-providers:resize': true
                };

                window.addEventListener('message', function (event) {
                    var data = event.data;

                    if (!data || typeof data !== 'object' || !supportedTypes[data.type]) {
                        return;
                    }

                    var wrappers = document.querySelectorAll('[data-ey-eric-providers]');

                    for (var index = 0; index < wrappers.length; index += 1) {
                        var wrapper = wrappers[index];
                        var frame = wrapper.querySelector('.ey-eric-providers-frame');

                        if (!frame || frame.contentWindow !== event.source) continue;

                        var expectedOrigin = wrapper.getAttribute('data-origin');
                        if (!expectedOrigin || event.origin !== expectedOrigin) return;

                        var minHeight = parseInt(wrapper.getAttribute('data-min-height'), 10) || 480;
                        var maxHeight = parseInt(wrapper.getAttribute('data-max-height'), 10) || 40000;
                        var requestedHeight = Math.ceil(Number(data.height));

                        if (Number.isFinite(requestedHeight) && requestedHeight > 0) {
                            var nextHeight = Math.max(minHeight, Math.min(maxHeight, requestedHeight));
                            frame.style.height = nextHeight + 'px';
                        }

                        if (typeof data.path === 'string' && data.path.indexOf('/providers') === 0) {
                            wrapper.setAttribute('data-current-path', data.path);
                        }

                        wrapper.dispatchEvent(new CustomEvent('ey-eric-providers:update', {
                            detail: {
                                height: requestedHeight,
                                path: typeof data.path === 'string' ? data.path : ''
                            }
                        }));

                        return;
                    }
                });
            }());
        </script>
        <?php
    }

    return ob_get_clean();
}
add_shortcode('ey_eric_providers', 'apc_providers_embed_shortcode');
