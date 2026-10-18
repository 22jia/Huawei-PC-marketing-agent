# Architecture Notes

Keep architecture decisions here: component boundaries, data flow, deployment notes, and known limitations.

The intended runtime flow is:

`web -> api -> local v7 retrieval -> optional VMall dynamic check -> agent orchestration -> validation -> web/export`

The checked-in `华为PC全板块深度知识库_v7` is the primary source for product, scenario, platform and governance content. VMall is queried only for time-sensitive public commerce fields such as current price, availability and promotion. IMA files remain as historical setup material and are not a runtime retrieval dependency.
