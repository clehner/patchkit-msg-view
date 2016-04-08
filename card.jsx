import React from 'react'
import mlib from 'ssb-msgs'
import threadlib from 'patchwork-threads'
import onImageLoaded from 'image-loaded'
import multicb from 'multicb'
import ClipboardBtn from 'react-clipboard.js'
import cls from 'classnames'
import { MsgLink, UserLink, UserLinks, UserPic } from 'patchkit-links'
import NiceDate from 'patchkit-nicedate'
import { Block as Content, Inline as ContentInline } from 'patchkit-msg-content'
import { Inline as MdInline } from 'patchkit-markdown'
import Modal from 'patchkit-modal/single'
import FlagMsgForm from 'patchkit-form-flag-msg'
import DropdownBtn from 'patchkit-dropdown'
import u from 'patchkit-util'
import social from 'patchkit-util/social'

const INLINE_LENGTH_LIMIT = 100
const MAX_CONTENT_HEIGHT = 200 // px

function getVotes (msg, filter) {
  if (!msg.votes) return []
  return Object.keys(msg.votes).filter(filter)
}

function userIsTrusted (context, userId) {
  return userId === context.user.id || social.follows(context.users, context.user.id, userId)
}

class BookmarkBtn extends React.Component {
  static propTypes = {
    onClick: React.PropTypes.func.isRequired,
    isBookmarked: React.PropTypes.bool
  }

  onClick(e) {
    e.stopPropagation()
    this.props.onClick()
  }
  render() {
    const b = this.props.isBookmarked
    const title = 'Bookmark'+(b?'ed':'')
    const hint = (b?'Remove this message from your bookmarks':'Add this message to your bookmarks')
    return <span>
      <a href='javascript:;' className={'hint--bottom save'+(b?' selected':'')} data-hint={hint} onClick={this.onClick.bind(this)} title={title}>
        <i className={'fa fa-bookmark'+(b?'':'-o')} />
      </a>
    </span>
  }
}

class DigBtn extends React.Component {
  static propTypes = {
    onClick: React.PropTypes.func.isRequired,
    upvoters: React.PropTypes.array.isRequired,
    isUpvoted: React.PropTypes.bool
  }
  static contextTypes = {
    users: React.PropTypes.object
  }

  onClick(e) {
    e.stopPropagation()
    this.props.onClick()
  }

  render() {
    let label = 'Dig this'
    if (this.props.upvoters.length)
      label = 'Dug by '+this.props.upvoters.map(id => u.getName(this.context.users, id)).join(', ')
    return <div className={'dig hint--top-left'+(this.props.isUpvoted?' highlighted':'')} onClick={this.onClick.bind(this)} data-hint={label}>
      <i className="fa fa-hand-peace-o" /> <span>{this.props.upvoters.length}</span>
    </div>
  }
}

class AuthorAndVia extends React.Component {
  static propTypes = {
    id: React.PropTypes.string.isRequired
  }
  static contextTypes = {
    users: React.PropTypes.object,
    user: React.PropTypes.object,
  }
  render() {
    const user = this.context.user
    const users = this.context.users
    const author = this.props.id
    var via = (user.id==author || social.follows(users, user.id, author))
      ? false
      : social.followedFollowers(users, user.id, author)
    if (via && via.length === 0)
      via = false
    return <span className="author">
      <UserLink id={author} /> { via ? <small>via <UserLinks ids={via} limit={1} /></small> : '' }
    </span>
  }
}

export default class Card extends React.Component {
  static propTypes = {
    onToggleStar: React.PropTypes.func.isRequired,
    msg: React.PropTypes.object.isRequired,

    onSelect: React.PropTypes.func,
    forceRaw: React.PropTypes.bool,
    forceExpanded: React.PropTypes.bool,
    onFlag: React.PropTypes.func,
    listView: React.PropTypes.bool,
    selectiveUpdate: React.PropTypes.bool
  }
  static contextTypes = {
    users: React.PropTypes.object.isRequired,
    user: React.PropTypes.object.isRequired,
    emit: React.PropTypes.func.isRequired,
    ssb: React.PropTypes.object.isRequired
  }

  constructor(props) {
    super(props)
    this.state = {
      isExpanded: false,
      isOversized: false,
      isViewingRaw: false,
      subject: null,
      isFlagModalOpen: false
    }
    this.changeCounter = props.msg.changeCounter || 0
  }

  isExpanded() {
    return this.props.forceExpanded || this.props.listView || this.state.isExpanded || (this.props.msg && !this.props.msg.isRead)
  }

  isCollapsable() {
    return !this.props.forceExpanded && !this.props.listView && this.isExpanded()
  }

  onSelect() {
    if (this.props.onSelect)
      this.props.onSelect(this.props.msg)
    else
      this.context.emit('open:msg', this.props.msg.key)
  }

  onToggleDataView(item) { 
    this.setState({ isViewingRaw: !this.state.isViewingRaw })
    this.markShouldUpdate()
  }

  onClickOpen(e) {
    // make sure this wasnt a click on a link
    for (var node = e.target; node; node = node.parentNode) {
      if (node.tagName == 'A')
        return
    }

    if (this.props.listView)
      this.onSelect()
  }

  onClickExpand(e) {
    e.preventDefault()
    e.stopPropagation()
    this.setState({ isExpanded: true })
    this.markShouldUpdate()
  }

  onClickCollapse(e) {
    if (this.isExpanded()) {
      e.preventDefault()
      this.setState({ isExpanded: false })
    }    
  }

  onSubmitFlag(reason) {
    this.props.onFlag(this.props.msg, reason)
    this.setState({ isFlagModalOpen: false })
    this.markShouldUpdate()
  }

  onFlag(item) {
    this.setState({ isFlagModalOpen: true })
    this.markShouldUpdate()
  }
  
  onUnflag(item) {
    this.props.onFlag(this.props.msg, 'unflag')
  }

  onCloseFlagModal() {
    this.setState({ isFlagModalOpen: false })
    this.markShouldUpdate()
  }

  componentDidMount() {
    this.checkOversized()

    // load subject msg, if needed
    let msg = this.props.msg
    if (msg.value && msg.value.content.type === 'vote') {
      let vote = mlib.link(msg.value.content.vote, 'msg')
      if (vote) {
        this.context.ssb.get(vote.link, (err, subject) => {
          if (!subject)
            return
          subject = { key: vote.link, value: subject }
          threadlib.decryptThread(this.context.ssb, subject, () => {
            this.setState({ subject: subject })
          })
        })
      }
    }
  }

  checkOversized() {
    // is the card oversized?
    if (!this.refs.body || !this.props.listView)
      return
    // wait for images to finish loading
    var done = multicb()
    Array.from(this.refs.body.querySelectorAll('img')).forEach(el => onImageLoaded(el, done()))
    done(() => {
      // check height
      if (!this.refs.body)
        return
      const rect = this.refs.body.getClientRects()[0]
      if (rect && rect.height > MAX_CONTENT_HEIGHT) {
        this.props.msg.isOversized = true // mark on the message, so we can load from that
        this.markShouldUpdate()
        this.setState({ isOversized: true })
      }
    })
  }

  shouldComponentUpdate(nextProps, nextState) {
    // this is a performance hack in react
    // we avoid extraneous render() calls (esp in the msg-list) by returning false
    // the changeCounter is tracked on message objects and incremented when an update is made
    if (nextProps.selectiveUpdate) {
      var shouldUpdate = this.changeCounter !== nextProps.msg.changeCounter
      this.changeCounter = nextProps.msg.changeCounter
      return shouldUpdate
    }
    return true
  }

  markShouldUpdate() {
    // the message's change counter increments when it needs to be rendered
    // if some state in this object changes, we decrement to get the same effect
    this.changeCounter--
  }

  render() {
    const msg = this.props.msg
    if (msg.isLink)
      return this.renderLink(msg)
    if (msg.isMention)
      return this.renderMention(msg)
    if (msg.isNotFound || !msg.value)
      return this.renderNotFound(msg)
    const upvoters = getVotes(this.props.msg, userId => msg.votes[userId] === 1)
    const downvoters = getVotes(this.props.msg, userId => userIsTrusted(this.context, userId) && msg.votes[userId] === -1)
    const isUpvoted = upvoters.indexOf(this.context.user.id) !== -1
    const isDownvoted = downvoters.indexOf(this.context.user.id) !== -1
    // if (msg.value.content.type == 'post' && downvoters.length > upvoters.length && !this.state.isExpanded)
      // return this.renderMuted(msg)
    if (!this.isExpanded())
      return this.renderPostCollapsed(msg)
    return this.renderPost(msg, upvoters, downvoters, isUpvoted, isDownvoted)
  }

  renderNotFound(msg) {
    const expanded = this.state.isExpanded
    return <div key={msg.key} className={'msg-view card-missing-post'+(expanded?'':' collapsed')}>
      <div>
        <a onClick={this.onClickExpand.bind(this)} style={{ cursor: 'pointer', fontWeight: 'bold' }}>
          <i className="fa fa-warning" /> Missing Post
        </a>
        { expanded ?
          <span>
            <br/><br/>
            {'This post has not been downloaded. It may be authored by somebody outside of your network. Some of the other messages in this thread may reference it.'}
            <br/><br/>
            <code>{msg.key}</code>
          </span> :
          ' Missing post.' }
      </div>
    </div>
  }

  renderLink(msg) {
    return <div key={msg.key} className="msg-view card-missing-post">
      <div><i className="fa fa-angle-double-up" /> <MsgLink id={msg.key} name="View the full discussion" /></div>
    </div>
  }

  renderMention(msg) {
    const name = u.shortString(msg.value.content.text || msg.key, 100)
    return <div key={msg.key} className="msg-view card-mention">
      <div>
        <i className="fa fa-hand-o-right" />
        <div><UserLink id={msg.value.author} /> referenced this thread in <MsgLink id={msg.key} name={name} /></div>
      </div>
    </div>
  }

  renderMuted(msg) {
    const text = msg.value.content.text
    return <div className={'msg-view card-muted'}>
      <div className="ctrls"><UserPic id={msg.value.author} /></div>
      <div className="content">
        <div><a onClick={this.onClickExpand.bind(this)}><MdInline limit={INLINE_LENGTH_LIMIT} md={text} /></a> <small>flagged</small></div>
        <div><NiceDate ts={msg.value.timestamp} /></div>
      </div>
    </div>
  }

  renderPostCollapsed(msg) {
    return <div className="msg-view card-post collapsed" onClick={this.onClickExpand.bind(this)}>
      <div className="content flex">
        <div className="header"><UserPic id={msg.value.author} /></div>
        <div className="body flex-fill"><ContentInline msg={msg} /></div>
      </div>
    </div>
  }

  renderPost(msg, upvoters, downvoters, isUpvoted, isDownvoted) {
    const replies = threadlib.countReplies(msg)
    const isListView   = this.props.listView
    const isViewingRaw = this.state.isViewingRaw
    const channel = msg && msg.value && msg.value.content && msg.value.content.channel
    const rootLink = msg && msg.value && msg.value.content && mlib.link(msg.value.content.root)
    
    const dropdownOpts = [
      {
        value: 'copy-link',
        Com: props => <ClipboardBtn component='li' data-clipboard-text={msg.key} onSuccess={props.onClick}>
          <i className="fa fa-external-link" /> Copy ID
        </ClipboardBtn>
        // onSelect: this.markShouldUpdate.bind(this)
      },
      { 
        value: 'toggle-raw',
        label: <span><i className={isViewingRaw?'fa fa-envelope-o':'fa fa-gears'} /> View {isViewingRaw?'Msg':'Data'}</span>,
        onSelect: this.onToggleDataView.bind(this)
      },
      (isDownvoted ?
        { value: 'unflag', label: <span><i className="fa fa-times" /> Unflag</span>, onSelect: this.onUnflag.bind(this) } :
        { value: 'flag',   label: <span><i className="fa fa-flag" /> Flag</span>,    onSelect: this.onFlag.bind(this) }
      )
    ]

    const className = cls('msg-view card-post', {
      oversized: !this.state.isExpanded && (msg.isOversized||this.state.isOversized),
      collapsable: this.isCollapsable(),
      'new': msg.isgNew,
      'list-view': isListView,
      unread: msg.hasUnread,
      expanded: this.state.isExpanded
    })
    return <div className={className} onClick={this.onClickOpen.bind(this)}>
      <div className="content">
        <div className="header">
          <UserPic id={msg.value.author} />
          <div className="flex-fill">
            <div>
              <AuthorAndVia id={msg.value.author} />
              { isListView && rootLink
                ? <small> <MsgLink id={rootLink.link}>Reply <i className="fa fa-angle-double-up" /></MsgLink></small>
                : '' }
            </div>
            <div className="audience">
              <MsgLink className="date" id={msg.key}>
                <i className={`fa fa-${msg.plaintext?'bullhorn':'lock'}`} /> <NiceDate ts={msg.value.timestamp} />
              </MsgLink>
            </div>
          </div>
          { isListView
            ? <div>
                { channel ? <span className="channel"><a href={`#/channel/${channel}`}>#{channel}</a></span> : '' }
              </div>
            : <div>
                { this.isCollapsable() ? <a className="collapse-btn" onClick={this.onClickCollapse.bind(this)}><i className="fa fa-angle-up"/></a> : '' }
                <DropdownBtn items={dropdownOpts} right><i className="fa fa-ellipsis-h" /></DropdownBtn>
              </div> }
        </div>
        <div className="body" ref="body">
          <Content msg={msg} forceRaw={isViewingRaw||this.props.forceRaw} />
        </div>
        <div className="footer">
          <div className="read-more" onClick={this.onClickExpand.bind(this)}>Read more</div>
          <div className="flex-fill"/>
          <DigBtn onClick={()=>this.props.onToggleStar(msg)} isUpvoted={isUpvoted} upvoters={upvoters} />
        </div>
      </div>
      { isListView && replies > 0
        ? <div className="replies">
            { getLastTwoPosts(msg).map(r => {
              if (!r.value) return <span/>
              return <div className="reply" key={r.key}>
                <UserPic id={r.value.author} />
                <div><UserLink id={r.value.author} /> <ContentInline msg={r} limit={250} /></div>
              </div>
            }) }
            { replies > 2 ? <div className="reply" style={{whiteSpace:'pre'}}>{ replies-2 } more replies { msg.hasUnread ? <strong>(new)</strong> : '' }</div> : '' }
          </div>
        : '' }
      <Modal className="center-block" isOpen={this.state.isFlagModalOpen} onClose={this.onCloseFlagModal.bind(this)} Form={FlagMsgForm} formProps={{msg: msg, onSubmit: this.onSubmitFlag.bind(this)}} nextLabel="Publish" />
    </div>
  }
}

function getLastTwoPosts (msg) {
  return threadlib
    .flattenThread(msg)
    .filter(reply => mlib.relationsTo(reply, msg).indexOf('root') >= 0)
    .slice(-2)
}

