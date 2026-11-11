function acceptsMarkdown(acceptHeader = '') {
  return acceptHeader.split(',').some(mediaRange => {
    const [mediaType, ...parameters] = mediaRange.trim().toLowerCase().split(';');
    if (mediaType !== 'text/markdown') return false;
    const quality = parameters.find(parameter => /^\s*q\s*=/.test(parameter));
    return quality == null || Number(quality.split('=')[1]) > 0;
  });
}

const homepageLinkHeader = [
  '<https://a-kime.com/llms.txt>; rel="describedby"; type="text/plain"',
  '<https://a-kime.com/index.md>; rel="alternate"; type="text/markdown"'
].join(', ');

module.exports = { acceptsMarkdown, homepageLinkHeader };
